cmake_minimum_required(VERSION 3.20)
project(PremiereMotionTrackerAddon VERSION 0.1.9 LANGUAGES CXX)

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
