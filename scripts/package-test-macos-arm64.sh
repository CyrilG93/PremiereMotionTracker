#!/bin/bash
set -euo pipefail

# Build an Apple-Silicon CCX package with every Homebrew dylib required by the Hybrid addon.
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
version="$(node -p "require('$project_dir/package.json').version")"
addon_name="premiere-motion-tracker-${version}.uxpaddon"
source_addon="$project_dir/mac/arm64/$addon_name"
source_ffmpeg="$project_dir/mac/arm64/bin/ffmpeg"
source_ffmpeg_license="$project_dir/mac/arm64/bin/FFMPEG-LICENSE.txt"
codesign_identity="${PMT_CODESIGN_IDENTITY:--}"
notary_profile="${PMT_NOTARY_PROFILE:-}"
codesign_jobs="${PMT_CODESIGN_JOBS:-8}"
if ! [[ "$codesign_jobs" =~ ^[1-9][0-9]*$ ]]; then
  echo "PMT_CODESIGN_JOBS must be a positive integer." >&2
  exit 1
fi
package_label="unsigned"
if [ "$codesign_identity" != "-" ]; then
  package_label="signed"
fi
if [ -n "$notary_profile" ]; then
  if [ "$codesign_identity" = "-" ]; then
    echo "PMT_NOTARY_PROFILE requires a Developer ID signing identity." >&2
    exit 1
  fi
  package_label="notarized"
fi
default_output_dir="$project_dir/Releases/Test"
if [ "$package_label" = "notarized" ]; then
  default_output_dir="$project_dir/Releases"
fi
output_dir="${1:-$default_output_dir}"
output_file="$output_dir/PremiereMotionTracker-${version}-macos-arm64-${package_label}.ccx"

if [ ! -f "$source_addon" ]; then
  echo "Missing arm64 addon: $source_addon" >&2
  exit 1
fi
if [ ! -x "$source_ffmpeg" ] || [ ! -f "$source_ffmpeg_license" ]; then
  echo "Missing bundled LGPL FFmpeg runtime: $source_ffmpeg and FFMPEG-LICENSE.txt are required." >&2
  exit 1
fi
# Reject a development-machine FFmpeg before it can be copied into a public package.
if /usr/bin/otool -L "$source_ffmpeg" | /usr/bin/awk 'NR > 2 { print $1 }' | /usr/bin/grep -qE '(/opt/homebrew|/usr/local|@rpath/)'; then
  echo "The bundled FFmpeg still depends on Homebrew or @rpath libraries." >&2
  exit 1
fi
if [ -e "$output_file" ]; then
  echo "Refusing to overwrite existing package: $output_file" >&2
  exit 1
fi

mkdir -p "$output_dir"
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/pmt-package.XXXXXX")"
trap 'rm -rf "$stage_dir"' EXIT
plugin_dir="$stage_dir/plugin"
library_dir="$plugin_dir/mac/arm64/lib"
mkdir -p "$library_dir"

# Stage only runtime files; sources, build folders and the Hybrid SDK must never ship to a tester.
for runtime_file in index.html index.js manifest.json styles.css package.json; do
  /usr/bin/ditto "$project_dir/$runtime_file" "$plugin_dir/$runtime_file"
done
/usr/bin/ditto "$project_dir/src" "$plugin_dir/src"
/usr/bin/ditto "$project_dir/assets" "$plugin_dir/assets"
/bin/mkdir -p "$plugin_dir/mac/arm64"
/bin/cp -L "$source_addon" "$plugin_dir/mac/arm64/$addon_name"
/bin/mkdir -p "$plugin_dir/mac/arm64/bin"
/bin/cp -L "$source_ffmpeg" "$plugin_dir/mac/arm64/bin/ffmpeg"
/bin/cp -L "$source_ffmpeg_license" "$plugin_dir/mac/arm64/bin/FFMPEG-LICENSE.txt"

# Sign each executable component explicitly; --deep is unsafe for a bundle with independently linked libraries.
sign_macho() {
  local target_file="$1"
  if [ "$codesign_identity" = "-" ]; then
    /usr/bin/codesign --force --sign - --timestamp=none "$target_file"
  else
    /usr/bin/codesign --force --sign "$codesign_identity" --options runtime --timestamp "$target_file"
  fi
}

# Resolve an indirect Mach-O dependency from its original Homebrew binary before staging it.
resolve_dependency() {
  local dependency="$1"
  local source_file="$2"
  local source_directory
  local candidate
  local rpath
  local library_name

  source_directory="$(cd "$(dirname "$source_file")" && pwd)"
  case "$dependency" in
    /opt/homebrew/*|/usr/local/*)
      [ -f "$dependency" ] && printf '%s\n' "$dependency"
      return
      ;;
    @loader_path/*)
      candidate="${dependency/@loader_path/$source_directory}"
      [ -f "$candidate" ] && printf '%s\n' "$candidate"
      return
      ;;
    @rpath/*)
      library_name="${dependency#@rpath/}"
      while IFS= read -r rpath; do
        candidate="${rpath/@loader_path/$source_directory}/$library_name"
        if [ -f "$candidate" ]; then
          printf '%s\n' "$candidate"
          return
        fi
      done < <(/usr/bin/otool -l "$source_file" | /usr/bin/awk '$1 == "cmd" && $2 == "LC_RPATH" { found = 1; next } found && $1 == "path" { print $2; found = 0 }')

      # Homebrew libraries commonly use @rpath for siblings in the same formula.
      candidate="$source_directory/$library_name"
      if [ -f "$candidate" ]; then
        printf '%s\n' "$candidate"
        return
      fi
      candidate="$(/usr/bin/find -L /opt/homebrew/opt /opt/homebrew/lib /usr/local/opt /usr/local/lib -type f -name "$library_name" -path '*/lib/*' -print 2>/dev/null | /usr/bin/head -n 1 || true)"
      [ -n "$candidate" ] && printf '%s\n' "$candidate"
      return
      ;;
  esac
}

# Follow Homebrew paths and @rpath references recursively; macOS system libraries are supplied by the operating system.
declare -a source_queue=("$source_addon")
declare -a staged_queue=("$plugin_dir/mac/arm64/$addon_name")
queue_index=0
while [ "$queue_index" -lt "${#source_queue[@]}" ]; do
  current_source="${source_queue[$queue_index]}"
  queue_index=$((queue_index + 1))
  while IFS= read -r dependency; do
    resolved_dependency="$(resolve_dependency "$dependency" "$current_source")"
    case "$dependency" in
      /opt/homebrew/*|/usr/local/*|@loader_path/*|@rpath/*)
        if [ -z "$resolved_dependency" ]; then
          echo "Unable to resolve native dependency $dependency from $current_source" >&2
          exit 1
        fi
        dependency_name="$(basename "$resolved_dependency")"
        staged_dependency="$library_dir/$dependency_name"
        if [ ! -f "$staged_dependency" ]; then
          /bin/cp -L "$resolved_dependency" "$staged_dependency"
          source_queue+=("$resolved_dependency")
          staged_queue+=("$staged_dependency")
        fi
        ;;
    esac
  # The first Mach-O entry is the binary's own install name, not a dependency to copy.
  done < <(/usr/bin/otool -L "$current_source" | /usr/bin/awk 'NR > 2 { print $1 }')
done

# Rebase copied dylibs to the addon's local lib folder so the test machine never needs Homebrew or unresolved @rpath paths.
while IFS= read -r current_file; do
  current_name="$(basename "$current_file")"
  change_args=()
  /usr/bin/install_name_tool -id "@loader_path/$current_name" "$current_file"
  while IFS= read -r dependency; do
    case "$dependency" in
      /opt/homebrew/*|/usr/local/*|@loader_path/*|@rpath/*)
        dependency_name="$(basename "$dependency")"
        if [ -f "$library_dir/$dependency_name" ]; then
          # Apply every rewritten dependency in one process to keep the package build fast.
          change_args+=( -change "$dependency" "@loader_path/$dependency_name" )
        fi
        ;;
    esac
  done < <(/usr/bin/otool -L "$current_file" | /usr/bin/awk 'NR > 2 { print $1 }')
  if [ "${#change_args[@]}" -gt 0 ]; then
    /usr/bin/install_name_tool "${change_args[@]}" "$current_file"
  fi
done < <(/usr/bin/find "$library_dir" -type f -name '*.dylib' -print)

# The addon lives one directory above lib, so its dependencies use an explicit lib prefix.
staged_addon="$plugin_dir/mac/arm64/$addon_name"
addon_change_args=()
while IFS= read -r dependency; do
  case "$dependency" in
    /opt/homebrew/*|/usr/local/*|@loader_path/*|@rpath/*)
      dependency_name="$(basename "$dependency")"
      if [ -f "$library_dir/$dependency_name" ]; then
        addon_change_args+=( -change "$dependency" "@loader_path/lib/$dependency_name" )
      fi
      ;;
  esac
done < <(/usr/bin/otool -L "$staged_addon" | /usr/bin/awk 'NR > 2 { print $1 }')
if [ "${#addon_change_args[@]}" -gt 0 ]; then
  /usr/bin/install_name_tool "${addon_change_args[@]}" "$staged_addon"
fi

# The timestamp service is network-bound, so sign independent dylibs concurrently after all install names are final.
export codesign_identity
export -f sign_macho
/usr/bin/find "$library_dir" -type f -name '*.dylib' -print0 | /usr/bin/xargs -0 -n 1 -P "$codesign_jobs" /bin/bash -c 'sign_macho "$1"' _
sign_macho "$staged_addon"
sign_macho "$plugin_dir/mac/arm64/bin/ffmpeg"

# Refuse to emit a package that still relies on a developer-machine Homebrew path.
# Skip each first otool entry because it is the binary's own install name, not a load dependency.
if {
  /usr/bin/otool -L "$staged_addon" | /usr/bin/awk 'NR > 2 { print $1 }'
  while IFS= read -r current_file; do
    /usr/bin/otool -L "$current_file" | /usr/bin/awk 'NR > 2 { print $1 }'
  done < <(/usr/bin/find "$library_dir" -type f -name '*.dylib' -print)
} | /usr/bin/grep -qE '(/opt/homebrew|/usr/local|@rpath/)'; then
  echo "Unbundled Homebrew or @rpath dependency remains in the staged addon." >&2
  exit 1
fi
/usr/bin/codesign --verify --strict --verbose=2 "$staged_addon"
/usr/bin/codesign --verify --strict --verbose=2 "$plugin_dir/mac/arm64/bin/ffmpeg"
while IFS= read -r current_file; do
  /usr/bin/codesign --verify --strict --verbose=2 "$current_file"
done < <(/usr/bin/find "$library_dir" -type f -name '*.dylib' -print)

# CCX is a ZIP container with the plugin manifest at its root; notarize the ZIP form before naming it .ccx.
notary_archive="$stage_dir/PremiereMotionTracker-${version}-macos-arm64-${package_label}.zip"
(
  cd "$plugin_dir"
  COPYFILE_DISABLE=1 /usr/bin/zip -qry "$notary_archive" .
)
if [ -n "$notary_profile" ]; then
  /usr/bin/xcrun notarytool submit "$notary_archive" --keychain-profile "$notary_profile" --wait
fi
/bin/mv "$notary_archive" "$output_file"
/usr/bin/unzip -t "$output_file" >/dev/null
echo "Created $package_label Apple-Silicon package: $output_file"
