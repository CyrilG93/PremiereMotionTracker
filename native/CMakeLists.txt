cmake_minimum_required(VERSION 3.20)
project(PremiereMotionTrackerAddon LANGUAGES CXX)

# Keep the algorithmic core independent from Adobe and OpenCV for portable tests.
add_library(PremiereMotionTrackerCore STATIC src/tracker_core.cpp)
target_compile_features(PremiereMotionTrackerCore PUBLIC cxx_std_17)
target_include_directories(PremiereMotionTrackerCore PUBLIC include)

include(CTest)
if(BUILD_TESTING)
  add_executable(PremiereMotionTrackerCoreTests tests/tracker_core_test.cpp)
  target_link_libraries(PremiereMotionTrackerCoreTests PRIVATE PremiereMotionTrackerCore)
  add_test(NAME PremiereMotionTrackerCoreTests COMMAND PremiereMotionTrackerCoreTests)
endif()

# Build the UXP addon only after the manually downloaded Adobe SDK is available.
if(DEFINED UXP_HYBRID_SDK_DIR)
  add_library(PremiereMotionTrackerAddon SHARED src/addon.cpp)
  target_compile_features(PremiereMotionTrackerAddon PRIVATE cxx_std_17)
  target_include_directories(PremiereMotionTrackerAddon PRIVATE "${UXP_HYBRID_SDK_DIR}/src/api" "${UXP_HYBRID_SDK_DIR}/src/utilities")
  target_link_libraries(PremiereMotionTrackerAddon PRIVATE PremiereMotionTrackerCore)

  # UXP addons are platform libraries distributed with Adobe's .uxpaddon extension.
  set_target_properties(PremiereMotionTrackerAddon PROPERTIES PREFIX "" SUFFIX ".uxpaddon")
else()
  message(STATUS "UXP_HYBRID_SDK_DIR is not set: building the portable tracking core only.")
endif()
