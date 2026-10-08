# How a LiDAR scanner sees — a Scanner Simulator

**[Open the live simulator →](https://adpchrgruber.github.io/adp_adv_pointcloud_simulator/)**

A terrestrial laser scanner stands in a model workshop and scans it, ray by ray. On the
left you orbit the workshop and watch the beam sweep, the head turn and the point cloud
grow; on the right you see what the machine sees — the 360° panorama filling column by
column. Everything runs in the browser, no build step.

It is the companion to [Scan Matter](https://github.com/adpchrgruber/adp_adv_point_lab),
the point-cloud workbench: Scan Matter opens finished scans, this page shows how one is
made — and why it has the gaps, shadows and ghosts it has.

## Use

1. **01 Scan** — *Start* (Space) runs the scan, *Reset* clears it, *Finish fast* turns
   *Speed* up to the maximum. *Speed* is in points per second of the simulation; the
   readout also gives the time a real FARO Focus–class scanner (~976 000 pts/s) would
   need. *Position* picks one of three stations — **A** workshop centre, **B** by the
   CNC mills, **C** near the shelf — each with its own scan, panorama and cloud.
   **Stack positions**: *Scan all 3* scans the stations one after the other, *Stack all
   positions in the scene* shows their clouds together, *Colour by position* tints them
   blue · orange · green, so you see which station filled which shadow.
2. **02 Display** — colour by **Colour** (surface colour), **Range** (distance, turbo
   colour map) or **Intensity** (return strength: angle of incidence and fall-off with
   distance). *Resolution* sets the angular step: 360 × 180 (1°), 512 × 256 or
   720 × 360 (0.5°); changing it resets all scans.
3. **03 Scene** — show or hide the point cloud and the workshop model, let the
   machines move (*Machines moving*), and set the *Turn* speed of the turntable
   (the button top right of the operator view). **Ambient occlusion** (radius,
   strength, quality) and **Soft shadows** shade the workshop.
4. **04 Annotations** — click a scanned point in the **panorama**: it is pinned at its
   place in the scene, with a line back to the scanner, its range, azimuth, elevation
   and coordinates. Add a note to each pin; click a row to centre the view on it.
5. **05 How it works** — the scan in five steps: range from travel time, the spinning
   mirror, the turning head, angles plus range become a point, and shadows and ghosts.

**What the machine sees** — *Panorama* is the equirectangular image (azimuth 0–360°,
elevation +90° to −60°, the cone below is the blind spot); the two cursors mark the two
columns the mirror is painting. *360 viewer* puts you inside it: drag to look around,
wheel to zoom. The readout shows head and mirror angle, current range, points,
progress and real scanner time.

**Controls** — drag to orbit · right-drag to pan · wheel to zoom · **Space** start /
pause · click the panorama to annotate · sun / moon button for light and dark theme.

### The workshop

A fab-lab after the CUBE workshop (Civic Architects): plywood, concrete and plaster, two
CNC mills, a gantry router, a robot arm at a brick wall, a robot on a linear rail, a cobot
on a workbench with a 3D printer, shelves, timber and brick stacks, and two pillars that
cast clear scan shadows. The robots, the rail carriage and the router move while you
scan — anything that moves leaves a smeared **ghost** in the cloud.

## How it works

- **Scan pattern** (as in a phase-shift scanner like the FARO Focus): the mirror spins
  about a horizontal axis and sweeps the beam through a vertical plane; the head turns
  about the vertical axis by 180° in total. One mirror turn paints two opposite columns —
  column *c* upward on the front half, column *c + W/2* downward on the back half — so
  half a head turn covers the full 360°. Elevations below −60° are not scanned (300°
  vertical field, as on the real instrument).
- **Ranging**: every ray is a three.js raycast from the mirror centre (1.47 m above the
  floor) against the workshop, up to 40 m. A hit stores range, surface colour, and
  `|n · d|` (angle of incidence) for shading and intensity; a miss stays black.
- **Fast raycasts**: the workshop's parts are merged into one mesh per material, and each
  merged mesh gets its own triangle BVH, so up to 100 000 rays per second
  stay interactive. Rays are cast in time-budgeted batches each frame.
- **Shadows and ghosts** fall out of the geometry: what a pillar or a machine hides from
  the scanner simply gets no points, and moving robots are sampled at different poses
  as the scan passes them.
- **Rendering**: the operator view is lit by a sun with soft shadow maps and a room
  environment, with GTAO ambient occlusion and ACES tone mapping; the point clouds, beam
  and annotations are drawn on top, untoned, so their colours match the panorama.
- **Scanner model**: the photogrammetry mesh of a FARO Focus is split by height into the
  static mount and the rotating head, and placed so the mirror centre sits on the axis
  at the origin of every ray.

## Credits

- **"Faro Focus"** ([Sketchfab](https://sketchfab.com/3d-models/faro-focus-0951b784b9114afa88ef19e8a37c3838))
  by [VAR Lab](https://sketchfab.com/varlab), licensed under
  [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/). Textures were resized for
  the web.
- **[three.js](https://threejs.org)** (MIT) — rendering, GLTF loading, GTAO.
- **CUBE workshop**, Civic Architects — reference for the workshop's materials.
- UI style follows **[Scan Matter](https://github.com/adpchrgruber/adp_adv_point_lab)**.

## Run locally

Static site, no build step; three.js from the CDN. The scanner model and the ES modules
need http, not `file://`:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

## Publish on GitHub Pages

Push the repository, then Settings › Pages › Deploy from a branch › `main` / `/ (root)`.

## Repository layout

```
index.html           page, panels and theme switch
css/style.css        UI style
js/main.js           stations, UI, annotations, main loop
js/scanner.js        scanner model, scan simulation, point cloud, beam
js/panorama.js       panorama buffer and 360 viewer
js/workshop.js       procedural workshop, moving machines, triangle BVH
js/lighting.js       render pipeline: shadows, ambient occlusion, tone mapping
assets/faro_focus/   scanner model (glTF, CC-BY-4.0)
```
