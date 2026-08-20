cmake_minimum_required(VERSION 3.20)
project(PremiereMotionTrackerAddon VERSION 0.4.12 LANGUAGES CXX)

# Enable the OpenCV media decoder only in builds configured with vcpkg.
option(PMT_ENABLE_OPENCV "Build OpenCV media inspection support" OFF)

# Keep the algorithmic core independent from Adobe and OpenCV for portable tests.
add_library(PremiereMotionTrackerCore STATIC src/tracker_core.cpp)
target_compile_features(PremiereMotionTrackerCore PUBLIC cxx_std_17)
target_include_directories(PremiereMotionTrackerCore PUBLIC include)
set_target_properties(PremiereMotionTrackerCore PROPERTIES POSITION_INDEPENDENT_CODE ON)

include(CTest)
if(BUILD_TESTING)
  add_executable(PremiereMotionTrackerCoreTests tests/tracker_core_test.cpp)
  target_link_libraries(PremiereMotionTrackerCoreTests PRIVATE PremiereMotionTrackerCore)
  add_test(NAME PremiereMotionTrackerCoreTests COMMAND PremiereMotionTrackerCoreTests)
endif()

if(PMT_ENABLE_OPENCV)
  # OpenCV videoio uses Microsoft Media Foundation on the current Windows build.
  # The planar tracker detects corners inside the selected surface before estimating its homography.
  # Request only the modules used by the tracker; OpenCV 5 no longer exports the legacy features2d target.
  find_package(OpenCV CONFIG REQUIRED COMPONENTS core imgproc imgcodecs video videoio)
  set(PMT_OPENCV_TRACKING_LIBS ${OpenCV_LIBS})
  if(OpenCV_VERSION VERSION_GREATER_EQUAL "5.0")
    # OpenCV 5 moved findHomography into its geometry module.
    find_package(OpenCV CONFIG REQUIRED COMPONENTS geometry)
  else()
    # OpenCV 4 provides findHomography through the legacy calib3d module.
    find_package(OpenCV CONFIG REQUIRED COMPONENTS calib3d)
  endif()
  list(APPEND PMT_OPENCV_TRACKING_LIBS ${OpenCV_LIBS})
  # Detect static OpenCV so the Hybrid addon does not expect sidecar DLLs at runtime.
  get_target_property(PMT_OPENCV_CORE_TYPE opencv_core TYPE)
  # Derive the triplet bin directory from vcpkg's OpenCV package config location.
  get_filename_component(PMT_OPENCV_BIN_DIR "${OpenCV_DIR}/../../bin" ABSOLUTE)

  add_library(PremiereMotionTrackerMedia STATIC src/media_inspector.cpp)
  target_compile_features(PremiereMotionTrackerMedia PUBLIC cxx_std_17)
  target_include_directories(PremiereMotionTrackerMedia PUBLIC include)
  target_link_libraries(PremiereMotionTrackerMedia PUBLIC ${PMT_OPENCV_TRACKING_LIBS})
  if(MSVC)
    # Preserve French diagnostic strings encoded as UTF-8 in the native sources.
    target_compile_options(PremiereMotionTrackerMedia PRIVATE /utf-8)
  endif()

  if(BUILD_TESTING)
    # Exercise path validation separately from the UXP addon and Premiere host.
    add_executable(PremiereMotionTrackerMediaTests tests/media_inspector_test.cpp)
    target_link_libraries(PremiereMotionTrackerMediaTests PRIVATE PremiereMotionTrackerMedia)
    add_test(NAME PremiereMotionTrackerMediaTests COMMAND PremiereMotionTrackerMediaTests)
    # Let ctest locate the dynamic OpenCV libraries without changing the user's global PATH.
    set_tests_properties(PremiereMotionTrackerMediaTests PROPERTIES ENVIRONMENT "PATH=${PMT_OPENCV_BIN_DIR};$ENV{PATH}")
  endif()
endif()

# Build the UXP addon only after the manually downloaded Adobe SDK is available.
if(DEFINED UXP_HYBRID_SDK_DIR)
  add_library(PremiereMotionTrackerAddon SHARED
    src/addon.cpp
    "${UXP_HYBRID_SDK_DIR}/src/utilities/UxpAddon.cpp"
  )
  target_compile_features(PremiereMotionTrackerAddon PRIVATE cxx_std_17)
  target_compile_definitions(PremiereMotionTrackerAddon PRIVATE PMT_ADDON_VERSION="${PROJECT_VERSION}-native")
  target_include_directories(PremiereMotionTrackerAddon PRIVATE "${UXP_HYBRID_SDK_DIR}/src/api" "${UXP_HYBRID_SDK_DIR}/src/utilities")
  target_link_libraries(PremiereMotionTrackerAddon PRIVATE PremiereMotionTrackerCore)
  if(MSVC)
    # Compile the Hybrid bridge as UTF-8 so its user-facing errors are preserved.
    target_compile_options(PremiereMotionTrackerAddon PRIVATE /utf-8)
  endif()

  if(PMT_ENABLE_OPENCV)
    # Link decoding support only when the vcpkg toolchain supplied OpenCV.
    target_compile_definitions(PremiereMotionTrackerAddon PRIVATE PMT_WITH_OPENCV=1)
    target_link_libraries(PremiereMotionTrackerAddon PRIVATE PremiereMotionTrackerMedia)
    if(WIN32 AND NOT PMT_OPENCV_CORE_TYPE STREQUAL "STATIC_LIBRARY")
      # Place the required OpenCV runtime DLLs beside the addon for Premiere's native loader.
      add_custom_command(TARGET PremiereMotionTrackerAddon POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "$<TARGET_FILE:opencv_core>"
          "$<TARGET_FILE:opencv_imgproc>"
          "$<TARGET_FILE:opencv_video>"
          "$<TARGET_FILE:opencv_videoio>"
          "$<TARGET_FILE_DIR:PremiereMotionTrackerAddon>"
      )
    endif()
  endif()

  # UXP addons are platform libraries distributed with Adobe's .uxpaddon extension.
  set_target_properties(PremiereMotionTrackerAddon PROPERTIES
    # Version the filename so a loaded Premiere process does not lock the next build target.
    OUTPUT_NAME "premiere-motion-tracker-${PROJECT_VERSION}"
    PREFIX ""
    SUFFIX ".uxpaddon"
  )

  # Put each native binary where UXP resolves it for the current platform.
  if(WIN32)
    set(PMT_ADDON_OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../win/x64")
    set_target_properties(PremiereMotionTrackerAddon PROPERTIES
      RUNTIME_OUTPUT_DIRECTORY "${PMT_ADDON_OUTPUT_DIR}"
      RUNTIME_OUTPUT_DIRECTORY_DEBUG "${PMT_ADDON_OUTPUT_DIR}"
      RUNTIME_OUTPUT_DIRECTORY_RELEASE "${PMT_ADDON_OUTPUT_DIR}"
      RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${PMT_ADDON_OUTPUT_DIR}"
    )
  elseif(APPLE AND CMAKE_OSX_ARCHITECTURES STREQUAL "arm64")
    set(PMT_ADDON_OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../mac/arm64")
    set_target_properties(PremiereMotionTrackerAddon PROPERTIES LIBRARY_OUTPUT_DIRECTORY "${PMT_ADDON_OUTPUT_DIR}")
  elseif(APPLE)
    set(PMT_ADDON_OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../mac/x64")
    set_target_properties(PremiereMotionTrackerAddon PROPERTIES LIBRARY_OUTPUT_DIRECTORY "${PMT_ADDON_OUTPUT_DIR}")
  endif()
else()
  message(STATUS "UXP_HYBRID_SDK_DIR is not set: building the portable tracking core only.")
endif()
