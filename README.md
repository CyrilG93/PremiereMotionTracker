# Premiere Motion Tracker

Premiere Motion Tracker tracks a point or a flat surface in a Premiere Pro sequence and applies that motion to one or more other clips.

Use Point mode to transfer position movement to a logo, title, image, or video. Use Surface mode to place a clip onto a tracked four-corner surface with Corner Pin.
Use Reverse tracking to keep a tracked point centred in its original clip.

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
2. Set the sequence In and Out points to the part you want to track. If they do not overlap the selected clip, Motion Tracker automatically uses that clip's visible duration instead.
3. Put the source clip in the timeline and select it.

For Point and Surface tracking, the source and destination clips must be in the same sequence.

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

## Reverse Tracking

Reverse tracking uses an analysed Point track to move the original source clip in the opposite direction. The tracked point stays at the centre of the frame.

1. Complete a Point analysis and review it as usual.
2. Click **Reverse tracking**.
3. Motion Tracker adds a Transform effect and Position keyframes to the captured source clip.

No destination clip needs to be selected for Reverse tracking. Use Premiere Pro's **Edit > Undo** to remove the result.

Reverse tracking is a 2D translation stabilisation. It does not compensate for rotation, zoom, perspective changes, or rolling-shutter distortion. As with any stabilisation, moving the image can reveal empty edges; adjust Scale or Position in Premiere if needed.

## Track a Surface

1. Set In/Out, then capture and prepare a source clip.
2. Choose **Surface**.
3. Use Play or the frame slider to choose the best reference frame, then click the four corners of the surface in this order: top-left, top-right, bottom-right, bottom-left.
4. Drag the numbered handles to refine the selection.
5. Click **Analyze**.
6. Review the result with **Play**, the frame slider, or the yellow confidence markers. To fix a drift, drag one or more numbered corners on the affected frame, then choose whether to re-track **before** or **after** that frame.
7. Select the destination clip and click **Apply perspective**.

Surface mode works best with flat, textured, clearly visible surfaces. It can be unreliable on blurred, reflective, heavily occluded, or strongly deforming surfaces.

## Preview Options

The preview decodes the original source media file directly with its native engine. During preparation, it builds a compact local preview cache for the selected In/Out range; use it to select any reference frame before tracking. The tracker follows that reference both backwards to In and forwards to Out. Play follows the source frame rate and the frame slider reads the cache instantly.

- The original-file preview only supports the selected source media; it does not include timeline effects, titles, or other clips composited in the sequence.
- The Diagnostics log records the decoded source frame, source time, dimensions, and decoding time. Copy it after a failed test.
- A single Premiere still image remains available automatically if native media decoding fails.
- On Windows, the bundled LGPL FFmpeg decoder automatically handles codecs that Media Foundation cannot decode, including ProRes. It decodes only the selected In/Out range into temporary preview images; it does not re-encode your media.
- Preparing an initial frame can take longer when the In point is far into a long-GOP H.264/HEVC file, because Windows must seek and decode from a nearby keyframe. This delay is independent of the selected In/Out duration.

Windows installers include the FFmpeg decoder and its LGPL licence automatically; no separate FFmpeg installation is required.

## Formats, Privacy, and Limitations

- Landscape, square, vertical, and ultra-wide sequence formats are supported; tracking is not limited to 16:9.
- NAS media is supported when Premiere exposes a local media path. If it does not, the plugin uses an attached proxy when available, or lets you select the original source file manually.
- Reversed clips and variable time remapping are not supported; the plugin rejects them before analysis.
- Fast movement, motion blur, poor lighting, or low-detail areas can reduce tracking accuracy.
- Reverse tracking keeps a Point track centred with 2D Position keyframes only; it is not a replacement for full warp stabilisation.
- The plugin requires local file access only to analyse the selected media and create temporary previews. It does not upload media anywhere.
- The panel warns when the source and sequence frame rates are not integer multiples (for example, 25 fps and 30 fps). This can cause stuttering in the applied tracking; pairs such as 25/50 or 30/60 are supported without a warning.

The header language button shows the active language: **EN** for English and **FR** for French. Click it to switch.
Click the version badge beside **Motion Tracker** to open the product page in your default browser.

## Updates

When Motion Tracker opens, it checks the latest GitHub release. If a newer `.ccx` installer is available for your platform, a clickable banner downloads that installer. Restart Premiere Pro after installing the update.

## Changelog

### 0.7.0 — 26 August 2026

- Added Reverse tracking for 2D point stabilisation on the source clip.
