#include "tracker_core.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace pmt {

bool GrayFrame::isValid() const {
    if (width <= 0 || height <= 0) {
        return false;
    }
    return pixels.size() == static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
}

namespace {

// Read one grayscale pixel after callers have validated the requested patch bounds.
double pixelAt(const GrayFrame& frame, int x, int y) {
    return static_cast<double>(frame.pixels[static_cast<std::size_t>(y * frame.width + x)]);
}

// Ensure a complete square patch remains inside one frame.
bool patchFits(const GrayFrame& frame, int centerX, int centerY, int radius) {
    return centerX - radius >= 0
        && centerY - radius >= 0
        && centerX + radius < frame.width
        && centerY + radius < frame.height;
}

// Convert correlation from [-1, 1] into a stable confidence value in [0, 1].
double correlationConfidence(double correlation) {
    return std::clamp((correlation + 1.0) * 0.5, 0.0, 1.0);
}

} // namespace

TrackingResult trackPoint(
    const GrayFrame& previousFrame,
    const GrayFrame& currentFrame,
    TrackingPoint previousPoint,
    const TrackingSettings& settings
) {
    TrackingResult result;
    result.point = previousPoint;
    if (!previousFrame.isValid() || !currentFrame.isValid()) {
        return result;
    }
    if (previousFrame.width != currentFrame.width || previousFrame.height != currentFrame.height) {
        return result;
    }
    if (settings.patchRadius < 1 || settings.searchRadius < 0) {
        return result;
    }

    const int sourceX = static_cast<int>(std::lround(previousPoint.x));
    const int sourceY = static_cast<int>(std::lround(previousPoint.y));
    if (!patchFits(previousFrame, sourceX, sourceY, settings.patchRadius)) {
        return result;
    }

    const int patchWidth = settings.patchRadius * 2 + 1;
    const int patchArea = patchWidth * patchWidth;
    std::vector<double> centeredTemplate(static_cast<std::size_t>(patchArea));
    double templateMean = 0.0;
    for (int offsetY = -settings.patchRadius; offsetY <= settings.patchRadius; offsetY += 1) {
        for (int offsetX = -settings.patchRadius; offsetX <= settings.patchRadius; offsetX += 1) {
            templateMean += pixelAt(previousFrame, sourceX + offsetX, sourceY + offsetY);
        }
    }
    templateMean /= static_cast<double>(patchArea);

    double templateEnergy = 0.0;
    std::size_t templateIndex = 0;
    for (int offsetY = -settings.patchRadius; offsetY <= settings.patchRadius; offsetY += 1) {
        for (int offsetX = -settings.patchRadius; offsetX <= settings.patchRadius; offsetX += 1) {
            const double centered = pixelAt(previousFrame, sourceX + offsetX, sourceY + offsetY) - templateMean;
            centeredTemplate[templateIndex] = centered;
            templateEnergy += centered * centered;
            templateIndex += 1;
        }
    }
    if (templateEnergy <= std::numeric_limits<double>::epsilon()) {
        return result;
    }

    double bestCorrelation = -2.0;
    int bestX = sourceX;
    int bestY = sourceY;
    for (int candidateY = sourceY - settings.searchRadius; candidateY <= sourceY + settings.searchRadius; candidateY += 1) {
        for (int candidateX = sourceX - settings.searchRadius; candidateX <= sourceX + settings.searchRadius; candidateX += 1) {
            if (!patchFits(currentFrame, candidateX, candidateY, settings.patchRadius)) {
                continue;
            }
            double candidateMean = 0.0;
            for (int offsetY = -settings.patchRadius; offsetY <= settings.patchRadius; offsetY += 1) {
                for (int offsetX = -settings.patchRadius; offsetX <= settings.patchRadius; offsetX += 1) {
                    candidateMean += pixelAt(currentFrame, candidateX + offsetX, candidateY + offsetY);
                }
            }
            candidateMean /= static_cast<double>(patchArea);

            double candidateEnergy = 0.0;
            double covariance = 0.0;
            std::size_t candidateIndex = 0;
            for (int offsetY = -settings.patchRadius; offsetY <= settings.patchRadius; offsetY += 1) {
                for (int offsetX = -settings.patchRadius; offsetX <= settings.patchRadius; offsetX += 1) {
                    const double centeredCandidate = pixelAt(currentFrame, candidateX + offsetX, candidateY + offsetY) - candidateMean;
                    candidateEnergy += centeredCandidate * centeredCandidate;
                    covariance += centeredTemplate[candidateIndex] * centeredCandidate;
                    candidateIndex += 1;
                }
            }
            if (candidateEnergy <= std::numeric_limits<double>::epsilon()) {
                continue;
            }
            const double correlation = covariance / std::sqrt(templateEnergy * candidateEnergy);
            if (correlation > bestCorrelation) {
                bestCorrelation = correlation;
                bestX = candidateX;
                bestY = candidateY;
            }
        }
    }

    if (bestCorrelation < -1.0) {
        return result;
    }
    result.point = { static_cast<double>(bestX), static_cast<double>(bestY) };
    result.confidence = correlationConfidence(bestCorrelation);
    result.valid = bestCorrelation >= settings.minimumCorrelation;
    return result;
}

} // namespace pmt
