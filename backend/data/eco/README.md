# Ecosystem reference layers

Atlas computes **ecosystem exposure** (overlap with protected areas, Ramsar
sites, and land cover) against an event footprint. All layers are read from
this directory at worker time — nothing is fetched on the API request path.

Until the files below are present, exposure answers `null` and the API returns
204.

## Required files

| File | Source | Licence | CRS | Notes |
|---|---|---|---|---|
| `protected_areas.geojson` | [ICIMOD](https://www.icimod.org/) / Government of Nepal protected-area boundaries (verify current distribution channel before adding) | Verify per distributor — must be AGPL-compatible | **EPSG:4326** (WGS 84) | GeoJSON `FeatureCollection`. Each feature **must** include properties `name` (string) and `designation` (string, e.g. National Park, Wildlife Reserve). Geometry: `Polygon` or `MultiPolygon`. |
| `ramsar_sites.geojson` | Ramsar / Government of Nepal wetland inventory (verify current distribution channel before adding) | Verify per distributor — must be AGPL-compatible | **EPSG:4326** | GeoJSON `FeatureCollection`. Each feature **must** include property `name` (string). Geometry: `Polygon` or `MultiPolygon`. |
| `landcover_nepal.tif` | Nepal Land Cover Monitoring System (NLCMS), FRTC/ICIMOD | **CC BY 4.0** | GeoTIFF with embedded CRS (expected WGS 84 / UTM or geographic — reprojected internally) | Single-band or labelled raster. Pixel values map to class names via the embedded metadata or the class table documented by ICIMOD for the vintage you ship. |

## Do not fabricate

These boundaries and rasters must come from the authoritative distributors above.
Do not hand-draw polygons or invent download URLs. Wrong boundaries are worse
than no exposure figure.

## Layer vintages

When adding a file, record its reference year in `backend/data/eco/ATTRIBUTION.md`
and ensure `layer_vintages` in the exposure output reflects that year.

## Updating

1. Obtain the layer from the primary source with licence confirmation.
2. Place the file in this directory using the exact filename above.
3. Update `ATTRIBUTION.md`.
4. Restart the worker (or wait for the next footprint write) so exposure is
   recomputed.
