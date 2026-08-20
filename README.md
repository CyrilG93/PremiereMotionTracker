# Premiere Motion Tracker

Premiere Motion Tracker tracks a point or a flat surface in a Premiere Pro sequence and applies that motion to one or more other clips.

Use Point mode to transfer position movement to a logo, title, image, or video. Use Surface mode (beta) to place a clip onto a tracked four-corner surface with Corner Pin.

## Compatibility

- macOS on Apple Silicon (M-series Macs)
- Adobe Premiere Pro 26.2 or later
- Adobe Creative Cloud Desktop

The current macOS package does not support Intel Macs or Windows.

## Install

1. Download the `.ccx` installer from a trusted source.
2. Double-click the `.ccx` file. Adobe Creative Cloud Desktop opens automatically.
3. Choose **Install** and accept the requested permissions. macOS may ask for an administrator password because the plugin includes a native video-analysis engine.
4. Restart Premiere Pro if it was already open.
5. In Premiere Pro, open **Window > UXP Plugins > Motion Tracker**.

To remove the plugin, open Creative Cloud Desktop, go to **Plugins > Manage Plugins**, find Premiere Motion Tracker, then choose **Uninstall**.

## Before You Start

1. Open the sequence you want to work in.
2. Set the sequence In and Out points to the part you want to track.
3. Put the source clip in the timeline and select it.

The source and destination clips must be in the same sequence.

## Track a Point

1. Select the source clip and click **Capture and prepare**.
2. Click the preview image to place the tracking point.
3. Adjust **Search area** if the point moves quickly.
4. Click **Analyze**.
5. During analysis, use **Cancel analysis** if you need to stop. No partial tracking data is kept.
6. After tracking, review the result with **Play**, the frame slider, or the yellow confidence markers.
7. To fix a drift, select the affected frame, click the correct point, then click **Re-track from here**.
8. Select one or more destination clips in the timeline.
9. Click **Apply trajectory**.

The plugin adds a Transform effect and Position keyframes to every selected destination clip. Use Premiere Pro's **Edit > Undo** to remove the applied result.

## Preview Options

The preview contains every tracked frame in the selected range. On long clips, generating it can take time.

- Enable **Skip preview generation** before or during analysis to keep the tracking result without exporting preview images.
- Use **Skip preview** while images are being generated to stop the remaining preview export.
- Enable **Light smoothing when applying** to reduce small position jitters, or disable it to apply the raw motion.

## Track a Surface (Beta)

1. Capture and prepare a source clip.
2. Choose **Surface (beta)**.
3. Click the four corners of the surface in this order: top-left, top-right, bottom-right, bottom-left.
4. Drag the numbered handles to refine the selection.
5. Click **Analyze**.
6. Select the destination clip and click **Apply perspective**.

Surface mode works best with flat, textured, clearly visible surfaces. It can be unreliable on blurred, reflective, heavily occluded, or strongly deforming surfaces.

## Formats, Privacy, and Limitations

- Landscape, square, vertical, and ultra-wide sequence formats are supported; tracking is not limited to 16:9.
- Reversed clips are not supported. Variable time remapping may not track accurately.
- Fast movement, motion blur, poor lighting, or low-detail areas can reduce tracking accuracy.
- Point tracking requires at least two valid tracked frames.
- The plugin requires local file access only to analyze the selected media and create temporary previews. It does not upload media.
- The **Copy** button copies diagnostics to the clipboard for troubleshooting.

Use the **FR** button in the panel header to switch the interface to French.

## Changelog

No public release has been published yet.
