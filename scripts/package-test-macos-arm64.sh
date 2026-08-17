#!/bin/bash
set -euo pipefail

# Build an unsigned Apple-Silicon CCX test package with every Homebrew dylib required by the Hybrid addon.
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
version="$(node -p "require('$project_dir/package.json').version")"
addon_name="premiere-motion-tracker-${version}.uxpaddon"
source_addon="$project_dir/mac/arm64/$addon_name"
output_dir="${1:-$project_dir/Releases/Test}"
output_file="$output_dir/PremiereMotionTracker-${version}-macos-arm64-unsigned.ccx"

if [ ! -f "$source_addon" ]; then
  echo "Missing arm64 addon: $source_addon" >&2
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

# Follow only Homebrew dependencies recursively; macOS system libraries are supplied by the operating system.
declare -a dependency_queue=("$plugin_dir/mac/arm64/$addon_name")
queue_index=0
while [ "$queue_index" -lt "${#dependency_queue[@]}" ]; do
  current_file="${dependency_queue[$queue_index]}"
  queue_index=$((queue_index + 1))
  while IFS= read -r dependency; do
    case "$dependency" in
      /opt/homebrew/*|/usr/local/*)
        dependency_name="$(basename "$dependency")"
        staged_dependency="$library_dir/$dependency_name"
        if [ ! -f "$staged_dependency" ]; then
          /bin/cp -L "$dependency" "$staged_dependency"
          dependency_queue+=("$staged_dependency")
        fi
        ;;
    esac
  done < <(/usr/bin/otool -L "$current_file" | /usr/bin/awk 'NR > 1 { print $1 }')
done

# Rebase copied dylibs to the addon's local lib folder so the test machine never needs Homebrew.
while IFS= read -r current_file; do
  current_name="$(basename "$current_file")"
  /usr/bin/install_name_tool -id "@loader_path/$current_name" "$current_file"
  while IFS= read -r dependency; do
    case "$dependency" in
      /opt/homebrew/*|/usr/local/*)
        /usr/bin/install_name_tool -change "$dependency" "@loader_path/$(basename "$dependency")" "$current_file"
        ;;
    esac
  done < <(/usr/bin/otool -L "$current_file" | /usr/bin/awk 'NR > 1 { print $1 }')
  /usr/bin/codesign --force --sign - --timestamp=none "$current_file"
done < <(/usr/bin/find "$library_dir" -type f -name '*.dylib' -print)

# The addon lives one directory above lib, so its dependencies use an explicit lib prefix.
staged_addon="$plugin_dir/mac/arm64/$addon_name"
while IFS= read -r dependency; do
  case "$dependency" in
    /opt/homebrew/*|/usr/local/*)
      /usr/bin/install_name_tool -change "$dependency" "@loader_path/lib/$(basename "$dependency")" "$staged_addon"
      ;;
  esac
done < <(/usr/bin/otool -L "$staged_addon" | /usr/bin/awk 'NR > 1 { print $1 }')
/usr/bin/codesign --force --sign - --timestamp=none "$staged_addon"

# Refuse to emit a package that still relies on a developer-machine Homebrew path.
if /usr/bin/otool -L "$staged_addon" "$library_dir"/*.dylib | /usr/bin/grep -qE '(/opt/homebrew|/usr/local)'; then
  echo "Unbundled Homebrew dependency remains in the staged addon." >&2
  exit 1
fi
/usr/bin/codesign --verify --strict --verbose=2 "$staged_addon"

# CCX is a ZIP container with the plugin manifest at its root; this is an unsigned private test package.
(
  cd "$plugin_dir"
  COPYFILE_DISABLE=1 /usr/bin/zip -qry "$output_file" .
)
/usr/bin/unzip -t "$output_file" >/dev/null
echo "Created unsigned Apple-Silicon test package: $output_file"
