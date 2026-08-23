# Premiere Motion Tracker

Premiere Motion Tracker tracks a point or a flat surface in a Premiere Pro sequence and applies that motion to one or more other clips.

Use Point mode to transfer position movement to a logo, title, image, or video. Use Surface mode to place a clip onto a tracked four-corner surface with Corner Pin.

## Compatibility

- macOS on Apple Silicon (M-series Macs)
- Windows x64
- Adobe Premiere Pro 25.6 or later
- Adobe Creative Cloud Desktop

Intel Macs are not supported.

## Install

1. Download the `.ccx` installer from Gumroad.
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

1. Select the source clip, add in/out and click **Capture and prepare**.
2. Use Play or the frame slider to choose the source frame that best shows the point, then click it to place the tracking point.
3. Adjust **Search area** if the point moves quickly.
4. Click **Analyze**.
5. During analysis, use **Cancel analysis** if you need to stop. No partial tracking data is kept.
6. After tracking, review the result with **Play**, the frame slider, or the yellow confidence markers.
7. To fix a drift, select the affected frame, click the correct point, then choose whether to re-track **before** or **after** that frame.
8. Select one or more destination clips in the timeline.
9. Click **Apply trajectory**.

The plugin adds a Transform effect and Position keyframes to every selected destination clip. Use Premiere Pro's **Edit > Undo** to remove the applied result.

## Track a Surface

1. Set In/Out, then capture and prepare a source clip.
2. Choose **Surface**.
3. Use Play or the frame slider to choose the best reference frame, then click the four corners of the surface in this order: top-left, top-right, bottom-right, bottom-left.
4. Drag the numbered handles to refine the selection.
5. Click **Analyze**.
6. Use **Cancel analysis** if needed, then select the destination clip and click **Apply perspective**.

Surface mode works best with flat, textured, clearly visible surfaces. It can be unreliable on blurred, reflective, heavily occluded, or strongly deforming surfaces.

## Preview Options

The preview decodes the original source media file directly with its native engine. During preparation, it builds a compact local preview cache for the selected In/Out range; use it to select any reference frame before tracking. The tracker follows that reference both backwards to In and forwards to Out. Play follows the source frame rate and the frame slider reads the cache instantly.

- The original-file preview only supports the selected source media; it does not include timeline effects, titles, or other clips composited in the sequence.
- The Diagnostics log records the decoded source frame, source time, dimensions, and decoding time. Copy it after a failed test.
- A single Premiere still image remains available automatically if native media decoding fails.
- Preparing an initial frame can take longer when the In point is far into a long-GOP H.264/HEVC file, because Windows must seek and decode from a nearby keyframe. This delay is independent of the selected In/Out duration.

## Formats, Privacy, and Limitations

- Landscape, square, vertical, and ultra-wide sequence formats are supported; tracking is not limited to 16:9.
- NAS media is supported when Premiere exposes a local media path. If it does not, the plugin uses an attached proxy when available, or lets you select the original source file manually.
- Reversed clips are not supported. Variable time remapping may not track accurately.
- Fast movement, motion blur, poor lighting, or low-detail areas can reduce tracking accuracy.
- The plugin requires local file access only to analyse the selected media and create temporary previews. It does not upload media anywhere.
- The panel warns when the source and sequence frame rates are not integer multiples (for example, 25 fps and 30 fps). This can cause stuttering in the applied tracking; pairs such as 25/50 or 30/60 are supported without a warning.

Use the **FR** button in the panel header to switch the interface to French.

## Changelog

No public release has been published yet.
