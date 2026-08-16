cmake_minimum_required(VERSION 3.20)
project(PremiereMotionTrackerAddon LANGUAGES CXX)

# This bootstrap target validates the Adobe SDK wiring before OpenCV is linked.
if(NOT DEFINED UXP_HYBRID_SDK_DIR)
  message(FATAL_ERROR "Set UXP_HYBRID_SDK_DIR to the extracted Adobe UXP Hybrid Plugin SDK.")
endif()

add_library(PremiereMotionTrackerAddon SHARED src/addon.cpp)
target_compile_features(PremiereMotionTrackerAddon PRIVATE cxx_std_17)
target_include_directories(PremiereMotionTrackerAddon PRIVATE "${UXP_HYBRID_SDK_DIR}/src/api" "${UXP_HYBRID_SDK_DIR}/src/utilities")

# UXP addons are platform libraries distributed with Adobe's .uxpaddon extension.
set_target_properties(PremiereMotionTrackerAddon PROPERTIES PREFIX "" SUFFIX ".uxpaddon")

