# How a LiDAR scanner sees

[Open the live simulator](https://adpchrgruber.github.io/adp_adv_lidar_lab/)

Interactive terrestrial laser scanner simulator: orbit a model workshop on the left, watch the 360 degree scan build up on the right. Static site, no build step; three.js is loaded from a CDN.

## Run locally

```
python3 -m http.server 8000
```

Open http://localhost:8000 (the model and ES modules need http, not file://).

## Publish on GitHub Pages

Push the repository, then Settings > Pages > Deploy from a branch > `main` / `/ (root)`.

## Credits

This work is based on "Faro Focus" (https://sketchfab.com/3d-models/faro-focus-0951b784b9114afa88ef19e8a37c3838) by VAR Lab (https://sketchfab.com/varlab) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Textures were resized for the web.

UI style follows [Scan Matter](https://github.com/adpchrgruber/adp_adv_point_lab). Rendering by [three.js](https://threejs.org) (MIT).
