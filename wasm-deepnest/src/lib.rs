use clipper2_rust::{
    FillRule, Path64, Paths64, Point64, PointInPolygonResult, area, difference_64, intersect_64,
    minkowski_diff, minkowski_sum, point_in_polygon, translate_path, union_64, xor_64,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use wasm_bindgen::prelude::*;

const DEFAULT_SCALE: f64 = 10_000_000.0;
const DEFAULT_TOLERANCE: f64 = 1e-9;

#[derive(thiserror::Error, Debug)]
enum GeoError {
    #[error("invalid scale: {0}")]
    InvalidScale(f64),
    #[error("path must contain at least 3 points")]
    InvalidPath,
    #[error("all coordinates must be finite numbers")]
    NonFiniteCoordinate,
    #[error("integer overflow while scaling coordinates")]
    CoordinateOverflow,
    #[error("minkowski operation did not return a valid solution")]
    MinkowskiFailed,
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("flat coordinates length must be even (x,y pairs), got {0}")]
    InvalidFlatCoordsLen(usize),
    #[error("flat offsets must contain at least [0, end]")]
    InvalidFlatOffsets,
    #[error("flat offsets must start at 0")]
    InvalidFlatOffsetsStart,
    #[error("flat offsets must be non-decreasing")]
    InvalidFlatOffsetsOrder,
    #[error("flat offsets end ({end}) does not match point count ({points})")]
    InvalidFlatOffsetsEnd { end: usize, points: usize },
    #[error("pairwise arrays must have the same number of paths")]
    PairCountMismatch,
}

impl From<GeoError> for JsValue {
    fn from(value: GeoError) -> Self {
        JsValue::from_str(&value.to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
struct Point {
    x: f64,
    y: f64,
}

type Path = Vec<Point>;
type Paths = Vec<Path>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PolygonShape {
    #[serde(default, alias = "polygon", alias = "path", alias = "points")]
    points: Path,
    #[serde(default)]
    children: Paths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum PolygonLike {
    Path(Path),
    Shape(PolygonShape),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize)]
struct OuterNfpOutput {
    nfp: Path,
    regions: Paths,
    nfp_area: f64,
    solution_count: usize,
    scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OuterNfpJob {
    #[serde(default)]
    id: Option<String>,
    a: PolygonLike,
    b: PolygonLike,
    #[serde(default)]
    inside: bool,
    #[serde(default)]
    fill_rule: Option<String>,
    #[serde(default, alias = "holes", alias = "container_children")]
    holes: Paths,
}

#[derive(Debug, Clone, Serialize)]
struct OuterNfpBatchItem {
    id: Option<String>,
    ok: bool,
    nfp: Option<Path>,
    regions: Option<Paths>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FlatPaths {
    coords: Vec<f64>,
    offsets: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct BooleanOpInput {
    subject_paths: Paths,
    clip_paths: Paths,
    op: String,
    #[serde(default = "default_fill_rule")]
    fill_rule: String,
    #[serde(default)]
    scale: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct IntersectionAreaInput {
    a: Path,
    b: Path,
    #[serde(default = "default_fill_rule")]
    fill_rule: String,
    #[serde(default)]
    scale: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct PointInPolygonInput {
    point: Point,
    polygon: Path,
    #[serde(default)]
    scale: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct PolygonInput {
    polygon: Path,
}

#[derive(Debug, Clone, Deserialize)]
struct InnerNfpInput {
    container: PolygonLike,
    part: PolygonLike,
    #[serde(default, alias = "children", alias = "container_children")]
    holes: Paths,
    #[serde(default = "default_fill_rule")]
    fill_rule: String,
    #[serde(default)]
    scale: Option<f64>,
}

fn default_fill_rule() -> String {
    "nonzero".to_string()
}

fn init_once() {
    console_error_panic_hook::set_once();
}

fn parse_js<T: DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|e| GeoError::Serialization(format!("input parse failed: {e}")).into())
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value)
        .map_err(|e| GeoError::Serialization(format!("output serialize failed: {e}")).into())
}

fn normalize_shape(shape: PolygonLike) -> PolygonShape {
    match shape {
        PolygonLike::Path(points) => PolygonShape {
            points,
            children: Vec::new(),
        },
        PolygonLike::Shape(s) => s,
    }
}

fn polygon_area_compat(path: &[Point]) -> f64 {
    if path.len() < 3 {
        return 0.0;
    }
    if path.iter().any(|p| !p.x.is_finite() || !p.y.is_finite()) {
        return 0.0;
    }
    polygon_area_raw(path)
}

fn validate_scale(scale: Option<f64>) -> Result<f64, GeoError> {
    let s = scale.unwrap_or(DEFAULT_SCALE);
    if s.is_finite() && s > 0.0 {
        Ok(s)
    } else {
        Err(GeoError::InvalidScale(s))
    }
}

fn almost_equal(a: f64, b: f64, tolerance: f64) -> bool {
    (a - b).abs() < tolerance
}

fn validate_path(path: &[Point]) -> Result<(), GeoError> {
    if path.len() < 3 {
        return Err(GeoError::InvalidPath);
    }
    validate_finite_points(path)?;
    Ok(())
}

fn validate_finite_points(path: &[Point]) -> Result<(), GeoError> {
    if path.iter().any(|p| !p.x.is_finite() || !p.y.is_finite()) {
        return Err(GeoError::NonFiniteCoordinate);
    }
    Ok(())
}

fn normalize_path(path: &[Point]) -> Path {
    if path.len() > 1 {
        let first = path[0];
        let last = path[path.len() - 1];
        if almost_equal(first.x, last.x, DEFAULT_TOLERANCE)
            && almost_equal(first.y, last.y, DEFAULT_TOLERANCE)
        {
            return path[..path.len() - 1].to_vec();
        }
    }
    path.to_vec()
}

fn to_i64(v: f64) -> Result<i64, GeoError> {
    if !v.is_finite() {
        return Err(GeoError::NonFiniteCoordinate);
    }
    if v > i64::MAX as f64 || v < i64::MIN as f64 {
        return Err(GeoError::CoordinateOverflow);
    }
    Ok(v.round() as i64)
}

fn to_path64(path: &[Point], scale: f64) -> Result<Path64, GeoError> {
    validate_path(path)?;
    let normalized = normalize_path(path);
    if normalized.len() < 3 {
        return Err(GeoError::InvalidPath);
    }

    let mut out = Path64::with_capacity(normalized.len());
    for p in normalized {
        out.push(Point64::new(to_i64(p.x * scale)?, to_i64(p.y * scale)?));
    }
    Ok(out)
}

fn to_paths64(paths: &[Path], scale: f64) -> Result<Paths64, GeoError> {
    let mut out = Paths64::with_capacity(paths.len());
    for p in paths {
        out.push(to_path64(p, scale)?);
    }
    Ok(out)
}

fn from_path64(path: &Path64, inv_scale: f64) -> Path {
    let mut out = Path::with_capacity(path.len());
    for p in path {
        out.push(Point {
            x: p.x as f64 * inv_scale,
            y: p.y as f64 * inv_scale,
        });
    }
    out
}

fn from_paths64(paths: &Paths64, inv_scale: f64) -> Paths {
    paths.iter().map(|p| from_path64(p, inv_scale)).collect()
}

fn paths_to_flat(paths: &[Path]) -> FlatPaths {
    let total_points: usize = paths.iter().map(|p| p.len()).sum();
    let mut coords = Vec::with_capacity(total_points * 2);
    let mut offsets = Vec::with_capacity(paths.len() + 1);
    let mut cursor: u32 = 0;
    offsets.push(cursor);

    for path in paths {
        for p in path {
            coords.push(p.x);
            coords.push(p.y);
        }
        cursor += path.len() as u32;
        offsets.push(cursor);
    }

    FlatPaths { coords, offsets }
}

fn validate_flat_layout(coords: &[f64], offsets: &[u32]) -> Result<(), GeoError> {
    if coords.len() % 2 != 0 {
        return Err(GeoError::InvalidFlatCoordsLen(coords.len()));
    }
    if offsets.len() < 2 {
        return Err(GeoError::InvalidFlatOffsets);
    }
    if offsets[0] != 0 {
        return Err(GeoError::InvalidFlatOffsetsStart);
    }
    if offsets.windows(2).any(|w| w[1] < w[0]) {
        return Err(GeoError::InvalidFlatOffsetsOrder);
    }

    let point_count = coords.len() / 2;
    let end = offsets[offsets.len() - 1] as usize;
    if end != point_count {
        return Err(GeoError::InvalidFlatOffsetsEnd {
            end,
            points: point_count,
        });
    }
    Ok(())
}

fn path_from_flat(coords: &[f64]) -> Result<Path, GeoError> {
    if coords.len() % 2 != 0 {
        return Err(GeoError::InvalidFlatCoordsLen(coords.len()));
    }
    let mut out = Vec::with_capacity(coords.len() / 2);
    let mut i = 0usize;
    while i < coords.len() {
        let x = coords[i];
        let y = coords[i + 1];
        if !x.is_finite() || !y.is_finite() {
            return Err(GeoError::NonFiniteCoordinate);
        }
        out.push(Point { x, y });
        i += 2;
    }
    Ok(out)
}

fn paths_from_flat(coords: &[f64], offsets: &[u32]) -> Result<Paths, GeoError> {
    validate_flat_layout(coords, offsets)?;
    let mut paths = Vec::with_capacity(offsets.len() - 1);
    for i in 0..offsets.len() - 1 {
        let start = offsets[i] as usize;
        let end = offsets[i + 1] as usize;
        let mut path = Vec::with_capacity(end.saturating_sub(start));
        for idx in start..end {
            let x = coords[idx * 2];
            let y = coords[idx * 2 + 1];
            if !x.is_finite() || !y.is_finite() {
                return Err(GeoError::NonFiniteCoordinate);
            }
            path.push(Point { x, y });
        }
        paths.push(path);
    }
    Ok(paths)
}

fn polygon_area_raw(path: &[Point]) -> f64 {
    if path.len() < 3 {
        return 0.0;
    }
    let mut sum = 0.0;
    for i in 0..path.len() {
        let j = (i + 1) % path.len();
        sum += path[i].x * path[j].y - path[j].x * path[i].y;
    }
    sum * 0.5
}

fn polygon_bounds_raw(path: &[Point]) -> Result<Bounds, GeoError> {
    validate_path(path)?;
    let mut min_x = path[0].x;
    let mut min_y = path[0].y;
    let mut max_x = path[0].x;
    let mut max_y = path[0].y;

    for p in path.iter().skip(1) {
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x);
        max_y = max_y.max(p.y);
    }

    Ok(Bounds {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    })
}

fn polygon_bounds_loose(path: &[Point]) -> Result<Option<Bounds>, GeoError> {
    if path.len() < 3 {
        return Ok(None);
    }
    if validate_finite_points(path).is_err() {
        return Ok(None);
    }
    polygon_bounds_raw(path).map(Some)
}

fn is_finite_path(path: &[Point]) -> bool {
    path.iter().all(|p| p.x.is_finite() && p.y.is_finite())
}

fn clean_regions(regions: Paths) -> Paths {
    let mut out = Vec::with_capacity(regions.len());
    for region in regions {
        if region.len() < 3 || !is_finite_path(&region) {
            continue;
        }
        if polygon_area_raw(&region).abs() <= DEFAULT_TOLERANCE {
            continue;
        }
        out.push(region);
    }
    out
}

fn area_paths_abs(paths: &Paths64) -> f64 {
    paths.iter().map(|p| area(p).abs()).sum()
}

fn parse_fill_rule(s: &str) -> FillRule {
    match s.to_ascii_lowercase().as_str() {
        "evenodd" | "even_odd" | "even-odd" | "alternate" => FillRule::EvenOdd,
        "positive" => FillRule::Positive,
        "negative" => FillRule::Negative,
        _ => FillRule::NonZero,
    }
}

fn run_boolean_op(
    subject_paths: &[Path],
    clip_paths: &[Path],
    op: &str,
    fill_rule: FillRule,
    scale: f64,
) -> Result<Paths, GeoError> {
    let subjects64 = to_paths64(subject_paths, scale)?;
    let clips64 = to_paths64(clip_paths, scale)?;
    let inv_scale = 1.0 / scale;

    let out = match op.to_ascii_lowercase().as_str() {
        "intersection" | "intersect" => intersect_64(&subjects64, &clips64, fill_rule),
        "union" => union_64(&subjects64, &clips64, fill_rule),
        "difference" | "diff" => difference_64(&subjects64, &clips64, fill_rule),
        "xor" => xor_64(&subjects64, &clips64, fill_rule),
        _ => {
            return Err(GeoError::Serialization(
                "invalid boolean op; use intersection|union|difference|xor".to_string(),
            ));
        }
    };

    Ok(from_paths64(&out, inv_scale))
}

fn run_boolean_op_flat(
    subject_coords: &[f64],
    subject_offsets: &[u32],
    clip_coords: &[f64],
    clip_offsets: &[u32],
    op: &str,
    fill_rule: FillRule,
    scale: f64,
) -> Result<FlatPaths, GeoError> {
    let subjects = paths_from_flat(subject_coords, subject_offsets)?;
    let clips = paths_from_flat(clip_coords, clip_offsets)?;
    let out = run_boolean_op(&subjects, &clips, op, fill_rule, scale)?;
    Ok(paths_to_flat(&out))
}

fn outer_nfp_paths(a: &[Point], b: &[Point], scale: f64) -> Result<Paths, GeoError> {
    let a64 = to_path64(a, scale)?;
    let mut b64 = to_path64(b, scale)?;
    let b0 = Point64::new(to_i64(b[0].x * scale)?, to_i64(b[0].y * scale)?);

    for p in &mut b64 {
        p.x = -p.x;
        p.y = -p.y;
    }

    let solution = minkowski_sum(&a64, &b64, true);
    if solution.is_empty() {
        return Err(GeoError::MinkowskiFailed);
    }

    let mut out = Vec::with_capacity(solution.len());
    for mut nfp64 in solution {
        for p in &mut nfp64 {
            p.x = p.x.saturating_add(b0.x);
            p.y = p.y.saturating_add(b0.y);
        }
        let nfp = from_path64(&nfp64, 1.0 / scale);
        if nfp.len() >= 3 {
            out.push(nfp);
        }
    }
    if out.is_empty() {
        return Err(GeoError::MinkowskiFailed);
    }
    Ok(out)
}

fn pick_largest_region(regions: &[Path]) -> Result<Path, GeoError> {
    let mut best_idx = None;
    let mut best_area = f64::NEG_INFINITY;
    for (idx, region) in regions.iter().enumerate() {
        let a = polygon_area_raw(region).abs();
        if a > best_area {
            best_area = a;
            best_idx = Some(idx);
        }
    }
    let idx = best_idx.ok_or(GeoError::MinkowskiFailed)?;
    Ok(regions[idx].clone())
}

fn to_outer_nfp_output(regions: Paths, scale: f64) -> Result<OuterNfpOutput, GeoError> {
    if regions.is_empty() {
        return Err(GeoError::MinkowskiFailed);
    }
    let nfp = pick_largest_region(&regions)?;
    Ok(OuterNfpOutput {
        nfp_area: polygon_area_raw(&nfp),
        nfp,
        solution_count: regions.len(),
        regions,
        scale,
    })
}

fn point_to_point64(point: &Point, scale: f64) -> Result<Point64, GeoError> {
    Ok(Point64::new(
        to_i64(point.x * scale)?,
        to_i64(point.y * scale)?,
    ))
}

fn retain_regions_with_valid_anchor(
    regions: Paths,
    container: &[Point],
    part: &[Point],
    holes: &[Path],
    scale: f64,
    fill_rule: FillRule,
) -> Result<Paths, GeoError> {
    let regions = clean_regions(regions);
    if regions.is_empty() {
        return Ok(regions);
    }

    let container64 = to_path64(container, scale)?;
    let container_paths = vec![container64];

    let valid_holes: Paths = holes
        .iter()
        .filter(|h| h.len() >= 3 && is_finite_path(h))
        .cloned()
        .collect();
    let holes64 = to_paths64(&valid_holes, scale)?;

    let part64 = to_path64(part, scale)?;
    let part_anchor = point_to_point64(&part[0], scale)?;
    let part_area = area(&part64).abs();
    if part_area <= DEFAULT_TOLERANCE {
        return Ok(Vec::new());
    }

    let area_tol = (part_area * 1e-6).max(1.0);
    let mut filtered = Vec::with_capacity(regions.len());

    for region in regions {
        let mut region_ok = false;
        for sample in &region {
            let sample64 = match point_to_point64(sample, scale) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let shifted = translate_path(
                &part64,
                sample64.x.saturating_sub(part_anchor.x),
                sample64.y.saturating_sub(part_anchor.y),
            );
            let shifted_paths = vec![shifted.clone()];
            let inter = intersect_64(&shifted_paths, &container_paths, fill_rule);
            if (area_paths_abs(&inter) - part_area).abs() > area_tol {
                continue;
            }

            if !holes64.is_empty() {
                let blocked = intersect_64(&shifted_paths, &holes64, fill_rule);
                if area_paths_abs(&blocked) > area_tol {
                    continue;
                }
            }

            region_ok = true;
            break;
        }

        if region_ok {
            filtered.push(region);
        }
    }

    Ok(filtered)
}

fn subtract_hole_nfps(
    regions: Paths,
    holes: &[Path],
    part: &[Point],
    scale: f64,
    fill_rule: FillRule,
) -> Result<Paths, GeoError> {
    if regions.is_empty() || holes.is_empty() {
        return Ok(regions);
    }

    let mut hole_nfps: Paths = Vec::new();
    for hole in holes {
        if hole.len() < 3 || !is_finite_path(hole) {
            continue;
        }
        if let Ok(hnfp_regions) = outer_nfp_paths(hole, part, scale) {
            hole_nfps.extend(hnfp_regions);
        }
    }

    if hole_nfps.is_empty() {
        return Ok(regions);
    }

    let regions64 = to_paths64(&regions, scale)?;
    let hole_nfps64 = to_paths64(&hole_nfps, scale)?;
    let diff = difference_64(&regions64, &hole_nfps64, fill_rule);
    Ok(clean_regions(from_paths64(&diff, 1.0 / scale)))
}

fn inner_nfp_regions(
    container: &[Point],
    part: &[Point],
    scale: f64,
    fill_rule: FillRule,
) -> Result<Paths, GeoError> {
    if is_axis_aligned_rectangle(container, 1e-7)? {
        return match rectangle_inner_nfp(container, part)? {
            Some(r) => Ok(vec![r]),
            None => Ok(Vec::new()),
        };
    }

    let a64 = to_path64(container, scale)?;
    let b64 = to_path64(part, scale)?;
    let b0 = Point64::new(to_i64(part[0].x * scale)?, to_i64(part[0].y * scale)?);
    let mut regions64 = minkowski_diff(&a64, &b64, true);
    if regions64.is_empty() {
        return Ok(Vec::new());
    }

    for path in &mut regions64 {
        for p in path {
            p.x = p.x.saturating_add(b0.x);
            p.y = p.y.saturating_add(b0.y);
        }
    }

    let out = clean_regions(from_paths64(&regions64, 1.0 / scale));
    if out.is_empty() {
        return Ok(out);
    }

    let filtered = retain_regions_with_valid_anchor(out, container, part, &[], scale, fill_rule)?;
    if filtered.is_empty() {
        // Do not fall back to frame approximation in strict-compat mode.
        return Ok(Vec::new());
    }
    Ok(filtered)
}

fn inner_nfp_core(
    container: &PolygonShape,
    part: &PolygonShape,
    extra_holes: &[Path],
    scale: f64,
    fill_rule: FillRule,
) -> Result<Paths, GeoError> {
    validate_path(&container.points)?;
    validate_path(&part.points)?;

    let mut holes = container.children.clone();
    holes.extend(extra_holes.iter().cloned());

    let base = inner_nfp_regions(&container.points, &part.points, scale, fill_rule)?;
    if base.is_empty() {
        return Ok(base);
    }

    let subtracted = subtract_hole_nfps(base, &holes, &part.points, scale, fill_rule)?;
    if subtracted.is_empty() {
        return Ok(subtracted);
    }

    retain_regions_with_valid_anchor(
        subtracted,
        &container.points,
        &part.points,
        &holes,
        scale,
        fill_rule,
    )
}

fn is_axis_aligned_rectangle(path: &[Point], tolerance: f64) -> Result<bool, GeoError> {
    validate_path(path)?;
    let bounds = polygon_bounds_raw(path)?;

    for p in path {
        let on_x = almost_equal(p.x, bounds.x, tolerance)
            || almost_equal(p.x, bounds.x + bounds.width, tolerance);
        let on_y = almost_equal(p.y, bounds.y, tolerance)
            || almost_equal(p.y, bounds.y + bounds.height, tolerance);
        if !(on_x && on_y) {
            return Ok(false);
        }
    }

    Ok(true)
}

fn rectangle_inner_nfp(container: &[Point], part: &[Point]) -> Result<Option<Path>, GeoError> {
    validate_path(container)?;
    validate_path(part)?;

    let mut min_ax = container[0].x;
    let mut min_ay = container[0].y;
    let mut max_ax = container[0].x;
    let mut max_ay = container[0].y;
    for p in container.iter().skip(1) {
        min_ax = min_ax.min(p.x);
        min_ay = min_ay.min(p.y);
        max_ax = max_ax.max(p.x);
        max_ay = max_ay.max(p.y);
    }

    let mut min_bx = part[0].x;
    let mut min_by = part[0].y;
    let mut max_bx = part[0].x;
    let mut max_by = part[0].y;
    for p in part.iter().skip(1) {
        min_bx = min_bx.min(p.x);
        min_by = min_by.min(p.y);
        max_bx = max_bx.max(p.x);
        max_by = max_by.max(p.y);
    }

    if (max_bx - min_bx) > (max_ax - min_ax) || (max_by - min_by) > (max_ay - min_ay) {
        return Ok(None);
    }

    let b0 = part[0];
    Ok(Some(vec![
        Point {
            x: min_ax - min_bx + b0.x,
            y: min_ay - min_by + b0.y,
        },
        Point {
            x: max_ax - max_bx + b0.x,
            y: min_ay - min_by + b0.y,
        },
        Point {
            x: max_ax - max_bx + b0.x,
            y: max_ay - max_by + b0.y,
        },
        Point {
            x: min_ax - min_bx + b0.x,
            y: max_ay - max_by + b0.y,
        },
    ]))
}

#[wasm_bindgen]
pub fn init() {
    init_once();
}

#[wasm_bindgen]
pub fn polygon_area(input: JsValue) -> Result<f64, JsValue> {
    init_once();
    let req: PolygonInput = parse_js(input)?;
    Ok(polygon_area_compat(&req.polygon))
}

#[wasm_bindgen]
pub fn polygon_bounds(input: JsValue) -> Result<JsValue, JsValue> {
    init_once();
    let req: PolygonInput = parse_js(input)?;
    let bounds = polygon_bounds_loose(&req.polygon).map_err(JsValue::from)?;
    to_js(&bounds)
}

#[wasm_bindgen]
pub fn polygon_area_flat(coords: &[f64]) -> Result<f64, JsValue> {
    init_once();
    let path = path_from_flat(coords).map_err(JsValue::from)?;
    Ok(polygon_area_compat(&path))
}

#[wasm_bindgen]
pub fn polygon_bounds_flat(coords: &[f64]) -> Result<JsValue, JsValue> {
    init_once();
    let path = path_from_flat(coords).map_err(JsValue::from)?;
    let bounds = polygon_bounds_loose(&path).map_err(JsValue::from)?;
    to_js(&bounds)
}

#[wasm_bindgen]
pub fn polygon_area_batch_flat(coords: &[f64], offsets: &[u32]) -> Result<Vec<f64>, JsValue> {
    init_once();
    let paths = paths_from_flat(coords, offsets).map_err(JsValue::from)?;
    let mut areas = Vec::with_capacity(paths.len());
    for p in &paths {
        areas.push(polygon_area_compat(p));
    }
    Ok(areas)
}

#[wasm_bindgen]
pub fn polygon_bounds_batch_flat(coords: &[f64], offsets: &[u32]) -> Result<JsValue, JsValue> {
    init_once();
    let paths = paths_from_flat(coords, offsets).map_err(JsValue::from)?;
    let mut out: Vec<Option<Bounds>> = Vec::with_capacity(paths.len());
    for p in &paths {
        out.push(polygon_bounds_loose(p).map_err(JsValue::from)?);
    }
    to_js(&out)
}

#[wasm_bindgen]
pub fn point_in_polygon_test(input: JsValue) -> Result<i32, JsValue> {
    init_once();
    let req: PointInPolygonInput = parse_js(input)?;
    let scale = validate_scale(Some(req.scale.unwrap_or(1000.0))).map_err(JsValue::from)?;
    if req.polygon.len() < 3 || validate_finite_points(&req.polygon).is_err() {
        return Ok(0);
    }
    let poly64 = match to_path64(&req.polygon, scale) {
        Ok(v) => v,
        Err(_) => return Ok(0),
    };
    let p64 = match point_to_point64(&req.point, scale) {
        Ok(v) => v,
        Err(_) => return Ok(0),
    };

    let out = match point_in_polygon(p64, &poly64) {
        PointInPolygonResult::IsInside => 1,
        PointInPolygonResult::IsOn => 0,
        PointInPolygonResult::IsOutside => -1,
    };

    Ok(out)
}

#[wasm_bindgen]
pub fn boolean_op(input: JsValue) -> Result<JsValue, JsValue> {
    init_once();
    let req: BooleanOpInput = parse_js(input)?;
    let scale = validate_scale(req.scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(&req.fill_rule);

    let out = run_boolean_op(
        &req.subject_paths,
        &req.clip_paths,
        &req.op,
        fill_rule,
        scale,
    )
    .map_err(JsValue::from)?;

    to_js(&out)
}

#[wasm_bindgen]
pub fn boolean_op_flat(
    subject_coords: &[f64],
    subject_offsets: &[u32],
    clip_coords: &[f64],
    clip_offsets: &[u32],
    op: String,
    fill_rule: Option<String>,
    scale: Option<f64>,
) -> Result<JsValue, JsValue> {
    init_once();
    let scale = validate_scale(scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(fill_rule.as_deref().unwrap_or("nonzero"));
    let out = run_boolean_op_flat(
        subject_coords,
        subject_offsets,
        clip_coords,
        clip_offsets,
        &op,
        fill_rule,
        scale,
    )
    .map_err(JsValue::from)?;
    to_js(&out)
}

#[wasm_bindgen]
pub fn intersection_area(input: JsValue) -> Result<f64, JsValue> {
    init_once();
    let req: IntersectionAreaInput = parse_js(input)?;
    let scale = validate_scale(req.scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(&req.fill_rule);
    if req.a.len() < 3
        || req.b.len() < 3
        || validate_finite_points(&req.a).is_err()
        || validate_finite_points(&req.b).is_err()
    {
        return Ok(0.0);
    }
    let a64 = to_path64(&req.a, scale).map_err(JsValue::from)?;
    let b64 = to_path64(&req.b, scale).map_err(JsValue::from)?;

    let out = intersect_64(&vec![a64], &vec![b64], fill_rule);
    let mut area_sum = 0.0;
    for p in &out {
        area_sum += area(p).abs();
    }

    Ok(area_sum / (scale * scale))
}

#[wasm_bindgen]
pub fn intersection_area_batch_flat(
    a_coords: &[f64],
    a_offsets: &[u32],
    b_coords: &[f64],
    b_offsets: &[u32],
    fill_rule: Option<String>,
    scale: Option<f64>,
) -> Result<Vec<f64>, JsValue> {
    init_once();
    let scale = validate_scale(scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(fill_rule.as_deref().unwrap_or("nonzero"));
    let a_paths = paths_from_flat(a_coords, a_offsets).map_err(JsValue::from)?;
    let b_paths = paths_from_flat(b_coords, b_offsets).map_err(JsValue::from)?;

    if a_paths.len() != b_paths.len() {
        return Err(GeoError::PairCountMismatch.into());
    }

    let mut out = Vec::with_capacity(a_paths.len());
    for i in 0..a_paths.len() {
        if a_paths[i].len() < 3
            || b_paths[i].len() < 3
            || validate_finite_points(&a_paths[i]).is_err()
            || validate_finite_points(&b_paths[i]).is_err()
        {
            out.push(0.0);
            continue;
        }

        let a64 = to_path64(&a_paths[i], scale).map_err(JsValue::from)?;
        let b64 = to_path64(&b_paths[i], scale).map_err(JsValue::from)?;
        let inter = intersect_64(&vec![a64], &vec![b64], fill_rule);
        let mut area_sum = 0.0;
        for p in &inter {
            area_sum += area(p).abs();
        }
        out.push(area_sum / (scale * scale));
    }
    Ok(out)
}

#[wasm_bindgen]
pub fn outer_nfp(
    a: JsValue,
    b: JsValue,
    inside: bool,
    scale: Option<f64>,
    fill_rule: Option<String>,
) -> Result<JsValue, JsValue> {
    init_once();
    let a_shape = normalize_shape(parse_js(a)?);
    let b_shape = normalize_shape(parse_js(b)?);
    let scale = validate_scale(scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(fill_rule.as_deref().unwrap_or("nonzero"));

    let regions = if inside {
        inner_nfp_core(&a_shape, &b_shape, &[], scale, fill_rule).map_err(JsValue::from)?
    } else {
        outer_nfp_paths(&a_shape.points, &b_shape.points, scale).map_err(JsValue::from)?
    };

    let out = to_outer_nfp_output(clean_regions(regions), scale).map_err(JsValue::from)?;
    to_js(&out)
}

#[wasm_bindgen]
pub fn outer_nfp_flat(
    a_coords: &[f64],
    b_coords: &[f64],
    inside: bool,
    scale: Option<f64>,
    fill_rule: Option<String>,
) -> Result<JsValue, JsValue> {
    init_once();
    let a_path = path_from_flat(a_coords).map_err(JsValue::from)?;
    let b_path = path_from_flat(b_coords).map_err(JsValue::from)?;
    let scale = validate_scale(scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(fill_rule.as_deref().unwrap_or("nonzero"));
    let regions = if inside {
        let container = PolygonShape {
            points: a_path,
            children: Vec::new(),
        };
        let part = PolygonShape {
            points: b_path,
            children: Vec::new(),
        };
        inner_nfp_core(&container, &part, &[], scale, fill_rule).map_err(JsValue::from)?
    } else {
        outer_nfp_paths(&a_path, &b_path, scale).map_err(JsValue::from)?
    };
    let out = to_outer_nfp_output(clean_regions(regions), scale).map_err(JsValue::from)?;
    to_js(&out)
}

#[wasm_bindgen]
pub fn outer_nfp_batch(
    jobs: JsValue,
    scale: Option<f64>,
    fill_rule: Option<String>,
) -> Result<JsValue, JsValue> {
    init_once();
    let jobs: Vec<OuterNfpJob> = parse_js(jobs)?;
    let scale = validate_scale(scale).map_err(JsValue::from)?;
    let mut out: Vec<OuterNfpBatchItem> = Vec::with_capacity(jobs.len());

    for job in jobs {
        let a_shape = normalize_shape(job.a);
        let b_shape = normalize_shape(job.b);
        let job_fill_rule = parse_fill_rule(
            job.fill_rule
                .as_deref()
                .unwrap_or(fill_rule.as_deref().unwrap_or("nonzero")),
        );
        let regions = if job.inside {
            inner_nfp_core(&a_shape, &b_shape, &job.holes, scale, job_fill_rule)
        } else {
            outer_nfp_paths(&a_shape.points, &b_shape.points, scale)
        };
        match regions {
            Ok(regions) => match to_outer_nfp_output(clean_regions(regions), scale) {
                Ok(out_item) => out.push(OuterNfpBatchItem {
                    id: job.id,
                    ok: true,
                    nfp: Some(out_item.nfp),
                    regions: Some(out_item.regions),
                    error: None,
                }),
                Err(e) => out.push(OuterNfpBatchItem {
                    id: job.id,
                    ok: false,
                    nfp: None,
                    regions: None,
                    error: Some(e.to_string()),
                }),
            },
            Err(e) => out.push(OuterNfpBatchItem {
                id: job.id,
                ok: false,
                nfp: None,
                regions: None,
                error: Some(e.to_string()),
            }),
        }
    }

    to_js(&out)
}

#[wasm_bindgen]
pub fn inner_nfp(input: JsValue) -> Result<JsValue, JsValue> {
    init_once();
    let req: InnerNfpInput = parse_js(input)?;
    let scale = validate_scale(req.scale).map_err(JsValue::from)?;
    let fill_rule = parse_fill_rule(&req.fill_rule);

    let container = normalize_shape(req.container);
    let part = normalize_shape(req.part);
    let regions =
        inner_nfp_core(&container, &part, &req.holes, scale, fill_rule).map_err(JsValue::from)?;
    if regions.is_empty() {
        return Ok(JsValue::NULL);
    }

    to_js(&regions)
}

#[wasm_bindgen]
pub fn point_in_polygon_bool(
    point: JsValue,
    polygon: JsValue,
    scale: Option<f64>,
) -> Result<bool, JsValue> {
    init_once();
    let point: Point = parse_js(point)?;
    let polygon: Path = parse_js(polygon)?;
    let scale = validate_scale(Some(scale.unwrap_or(1000.0))).map_err(JsValue::from)?;

    if polygon.len() < 3 || validate_finite_points(&polygon).is_err() {
        return Ok(false);
    }

    let poly64 = match to_path64(&polygon, scale) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    let p64 = match point_to_point64(&point, scale) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };
    Ok(matches!(
        point_in_polygon(p64, &poly64),
        PointInPolygonResult::IsInside
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, w: f64, h: f64) -> Path {
        vec![
            Point { x, y },
            Point { x: x + w, y },
            Point { x: x + w, y: y + h },
            Point { x, y: y + h },
        ]
    }

    fn l_shape() -> Path {
        vec![
            Point { x: 0.0, y: 0.0 },
            Point { x: 120.0, y: 0.0 },
            Point { x: 120.0, y: 40.0 },
            Point { x: 50.0, y: 40.0 },
            Point { x: 50.0, y: 120.0 },
            Point { x: 0.0, y: 120.0 },
        ]
    }

    #[test]
    fn test_polygon_area() {
        let r = rect(0.0, 0.0, 10.0, 5.0);
        let a = polygon_area_raw(&r);
        assert!((a - 50.0).abs() < 1e-9);
    }

    #[test]
    fn test_polygon_bounds() {
        let r = rect(2.0, 3.0, 4.0, 8.0);
        let b = polygon_bounds_raw(&r).expect("bounds");
        assert!((b.x - 2.0).abs() < 1e-9);
        assert!((b.y - 3.0).abs() < 1e-9);
        assert!((b.width - 4.0).abs() < 1e-9);
        assert!((b.height - 8.0).abs() < 1e-9);
    }

    #[test]
    fn test_rectangle_inner_nfp() {
        let container = rect(0.0, 0.0, 100.0, 50.0);
        let part = rect(0.0, 0.0, 20.0, 10.0);
        let nfp = rectangle_inner_nfp(&container, &part)
            .expect("ok")
            .expect("some");
        assert_eq!(nfp.len(), 4);
    }

    #[test]
    fn test_flat_roundtrip() {
        let p1 = rect(0.0, 0.0, 10.0, 5.0);
        let p2 = rect(20.0, 10.0, 3.0, 7.0);
        let paths = vec![p1, p2];
        let flat = paths_to_flat(&paths);
        let rebuilt = paths_from_flat(&flat.coords, &flat.offsets).expect("flat decode");
        assert_eq!(rebuilt.len(), 2);
        assert_eq!(rebuilt[0].len(), 4);
        assert_eq!(rebuilt[1].len(), 4);
    }

    #[test]
    fn test_outer_nfp_inside_rectangle_mode() {
        let container = rect(0.0, 0.0, 100.0, 50.0);
        let part = rect(0.0, 0.0, 20.0, 10.0);
        let regions = inner_nfp_regions(&container, &part, DEFAULT_SCALE, FillRule::NonZero)
            .expect("inside nfp");
        let inside_nfp = pick_largest_region(&regions).expect("largest");
        let count = regions.len();
        assert_eq!(count, 1);
        assert_eq!(inside_nfp.len(), 4);
    }

    #[test]
    fn test_minkowski_diff_rect_behavior() {
        let container = rect(0.0, 0.0, 100.0, 50.0);
        let part = rect(0.0, 0.0, 20.0, 10.0);
        let a64 = to_path64(&container, DEFAULT_SCALE).expect("a64");
        let b64 = to_path64(&part, DEFAULT_SCALE).expect("b64");
        let diff = minkowski_diff(&a64, &b64, true);
        assert!(!diff.is_empty());
        let diff2 = minkowski_diff(&b64, &a64, true);
        assert!(!diff2.is_empty());

        let mut best = 0usize;
        let mut best_area = f64::NEG_INFINITY;
        for (i, p) in diff.iter().enumerate() {
            let pa = area(p).abs();
            if pa > best_area {
                best_area = pa;
                best = i;
            }
        }

        let p = &diff[best];
        let mut min_x = p[0].x;
        let mut min_y = p[0].y;
        let mut max_x = p[0].x;
        let mut max_y = p[0].y;
        for pt in p.iter().skip(1) {
            min_x = min_x.min(pt.x);
            min_y = min_y.min(pt.y);
            max_x = max_x.max(pt.x);
            max_y = max_y.max(pt.y);
        }

        let width = (max_x - min_x) as f64 / DEFAULT_SCALE;
        let height = (max_y - min_y) as f64 / DEFAULT_SCALE;
        assert!(width > 0.0);
        assert!(height > 0.0);

        let mut best2 = 0usize;
        let mut best_area2 = f64::NEG_INFINITY;
        for (i, p2) in diff2.iter().enumerate() {
            let pa = area(p2).abs();
            if pa > best_area2 {
                best_area2 = pa;
                best2 = i;
            }
        }
        let p2 = &diff2[best2];
        let mut min_x2 = p2[0].x;
        let mut min_y2 = p2[0].y;
        let mut max_x2 = p2[0].x;
        let mut max_y2 = p2[0].y;
        for pt in p2.iter().skip(1) {
            min_x2 = min_x2.min(pt.x);
            min_y2 = min_y2.min(pt.y);
            max_x2 = max_x2.max(pt.x);
            max_y2 = max_y2.max(pt.y);
        }
        let width2 = (max_x2 - min_x2) as f64 / DEFAULT_SCALE;
        let height2 = (max_y2 - min_y2) as f64 / DEFAULT_SCALE;
        assert!(width2 > 0.0);
        assert!(height2 > 0.0);
    }

    #[test]
    fn test_polygon_bounds_loose_null_for_degenerate() {
        let one_point = vec![Point { x: 1.0, y: 2.0 }];
        let out = polygon_bounds_loose(&one_point).expect("ok");
        assert!(out.is_none());

        let non_finite = vec![
            Point { x: 0.0, y: 0.0 },
            Point {
                x: f64::NAN,
                y: 1.0,
            },
            Point { x: 1.0, y: 0.0 },
        ];
        let out_non_finite = polygon_bounds_loose(&non_finite).expect("ok");
        assert!(out_non_finite.is_none());
    }

    #[test]
    fn test_polygon_area_raw_zero_for_degenerate() {
        let line = vec![Point { x: 0.0, y: 0.0 }, Point { x: 1.0, y: 1.0 }];
        assert_eq!(polygon_area_raw(&line), 0.0);
    }

    #[test]
    fn test_inner_nfp_hole_subtraction_can_split_regions() {
        let container = PolygonShape {
            points: rect(0.0, 0.0, 100.0, 100.0),
            children: Vec::new(),
        };
        let part = PolygonShape {
            points: rect(0.0, 0.0, 20.0, 20.0),
            children: Vec::new(),
        };
        let regions = inner_nfp_core(
            &container,
            &part,
            &[rect(40.0, 0.0, 20.0, 100.0)],
            DEFAULT_SCALE,
            FillRule::NonZero,
        )
        .expect("inner_nfp_core");
        assert!(regions.len() >= 2);
    }

    #[test]
    fn test_inner_nfp_children_are_treated_as_holes() {
        let container_with_children = PolygonShape {
            points: rect(0.0, 0.0, 100.0, 100.0),
            children: vec![rect(40.0, 0.0, 20.0, 100.0)],
        };
        let part = PolygonShape {
            points: rect(0.0, 0.0, 20.0, 20.0),
            children: Vec::new(),
        };
        let regions = inner_nfp_core(
            &container_with_children,
            &part,
            &[],
            DEFAULT_SCALE,
            FillRule::NonZero,
        )
        .expect("inner_nfp_core");
        assert!(regions.len() >= 2);
    }

    #[test]
    fn test_inner_nfp_non_rect_with_hole_is_non_empty() {
        let container = PolygonShape {
            points: l_shape(),
            children: vec![rect(10.0, 10.0, 15.0, 15.0)],
        };
        let part = PolygonShape {
            points: rect(0.0, 0.0, 10.0, 10.0),
            children: Vec::new(),
        };
        let regions = inner_nfp_core(&container, &part, &[], DEFAULT_SCALE, FillRule::NonZero)
            .expect("inner_nfp_core");
        assert!(!regions.is_empty());
    }
}
