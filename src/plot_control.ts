import { PlotLine } from "./plot_line";
import { GraphControl } from "./graph_control";
import { PlotLineMapControl } from "./plot_line_map_control";
import { DOMControl } from "./dom_control";

import * as THREE from 'three';
import { Triplet, RGB, ComparableTriplet, Range } from "./plot_utils";
import { Object3D } from "three";
import { HydatParameter, HydatPhase, HydatTimePP, HydatException } from "./hydat";
import { PlotSettings } from "./plot_settings";
import { Construct, Constant } from "./parse";

const axisColorBases = new Triplet<RGB>(
  new RGB(1.0, 0.3, 0.3),
  new RGB(0.3, 1.0, 0.3),
  new RGB(0.3, 0.3, 1.0)
);

export class PlotControl {
  static array = -1;
  static current_line_vec_animation:THREE.Vector3[] = [];
  static PlotStartTime: number|undefined;

  static axisColors = new Triplet<string>("#FF8080", "#80FF80", "#8080FF")
  static prev_ranges: ComparableTriplet<Range>;
  static axisLines: Triplet<THREE.Object3D>;
  static plot_settings: PlotSettings;

  static init(plot_settings:PlotSettings) {
    this.plot_settings = plot_settings;
  }
  static divideParameter(parameter_map:{ [key: string]: HydatParameter }) {
    var now_parameter_condition_list: {[key:string]:Constant}[] = [{}];
  
    for (let parameter_name in parameter_map) {
      var setting = PlotControl.plot_settings.parameter_condition![parameter_name];
      if (setting.fixed) {
        for (var i = 0; i < now_parameter_condition_list.length; i++) {
          var parameter_value = setting.value;
          now_parameter_condition_list[i][parameter_name] = new Constant(parameter_value);
        }
      } else {
        var lb = setting.min_value;
        var ub = setting.max_value;
        var div = Math.floor(setting.value);
        var next_parameter_condition_list = [];
        var deltaP;
        if (div == 1) { deltaP = ub - lb; }
        else { deltaP = (ub - lb) / (div - 1); }
        for (var i = 0; i < now_parameter_condition_list.length; i++) {
          for (var j = 0; j < div; j++) {
            var parameter_value = lb + j * deltaP;
            let tmp_obj = $.extend(true, {}, now_parameter_condition_list[i]);  // deep copy
            tmp_obj[parameter_name] = new Constant(parameter_value);
            next_parameter_condition_list.push(tmp_obj);
          }
        }
        now_parameter_condition_list = next_parameter_condition_list;
      }
    }
    return now_parameter_condition_list;
  }

  static phase_to_line_vectors(phase: HydatPhase, parameter_condition_list:{[key:string]:Constant}, axis: Triplet<Construct>, maxDeltaT:number) {
    var line: { vec: THREE.Vector3, isPP: boolean }[] = [];
    var t;
    if (phase.simulation_state != "SIMULATED" && phase.simulation_state != "TIME_LIMIT" && phase.simulation_state != "STEP_LIMIT") return line;
  
    let env: { [key: string]: Construct; } = {};
    $.extend(env, parameter_condition_list, phase.variable_map);
  
    if (phase.time instanceof HydatTimePP) {
      env.t = phase.time.time_point;
      line.push({
        vec: new THREE.Vector3(axis.x.getValue(env), axis.y.getValue(env), axis.z.getValue(env)),
        isPP: true
      });
    } else {
      var start_time = phase.time.start_time.getValue(env);
      var end_time = phase.time.end_time.getValue(env);
      if (!Number.isFinite(start_time) || !Number.isFinite(end_time)) {
        throw new HydatException(`invalid time interval: from ${phase.time.start_time} to ${phase.time.end_time}`);
      }
      var MIN_STEP = 10; // Minimum step of plotting one IP
      var delta_t = Math.min(maxDeltaT, (end_time - start_time) / MIN_STEP);
      for (t = start_time; t < end_time; t = t + delta_t) {
        env.t = new Constant(t);
        line.push({
          vec: new THREE.Vector3(axis.x.getValue(env), axis.y.getValue(env), axis.z.getValue(env)),
          isPP: false
        });
      }
      env.t = new Constant(end_time);
      line.push({
        vec: new THREE.Vector3(axis.x.getValue(env), axis.y.getValue(env), axis.z.getValue(env)),
        isPP: false
      });
    }
    return line;
  }

  static checkAndStopPreloader() {
    // var table = document.getElementById("graph_axis_table");
    if (!PlotLineMapControl.isAllReady()) return;
    var current_time = new Date().getTime();
    if (PlotControl.PlotStartTime === undefined || current_time - PlotControl.PlotStartTime >= 1000) {
      DOMControl.showToast("Plot finished.", 1000, "blue");
    }
    PlotControl.PlotStartTime = undefined;
    GraphControl.renderer.render(GraphControl.scene, GraphControl.camera);
    DOMControl.stopPreloader();
  }
  static update_axes(force: boolean) {
    var ranges = PlotControl.getRangesOfFrustum(GraphControl.camera);
    if (force === true || PlotControl.prev_ranges === undefined || !ranges.equals(PlotControl.prev_ranges)) {
      var margin_rate = 1.1;

      var max_interval_px = 200; // 50 px
      const min_visible_ticks = Math.floor(Math.max(GraphControl.elem.clientWidth, GraphControl.elem.clientHeight) / max_interval_px);
      const min_visible_range = Math.min(ranges.x.getInterval(), ranges.y.getInterval(), ranges.z.getInterval());
      var max_interval = min_visible_range / min_visible_ticks;

      if (PlotControl.axisLines !== undefined) {
        GraphControl.scene.remove(PlotControl.axisLines.x);
        GraphControl.scene.remove(PlotControl.axisLines.y);
        GraphControl.scene.remove(PlotControl.axisLines.z);
      }
      var interval = Math.pow(10, Math.floor(Math.log(max_interval) / Math.log(10)));
      interval = 1;
      PlotControl.axisLines = new Triplet<Object3D>(
        PlotControl.makeAxis(ranges.x, interval, new THREE.Color(PlotControl.axisColors.x)),
        PlotControl.makeAxis(ranges.y, interval, new THREE.Color(PlotControl.axisColors.y)),
        PlotControl.makeAxis(ranges.z, interval, new THREE.Color(PlotControl.axisColors.z))
      );;
      ;
      PlotControl.axisLines.x.rotation.set(0, Math.PI / 2, Math.PI / 2);
      PlotControl.axisLines.y.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      GraphControl.scene.add(PlotControl.axisLines.x);
      GraphControl.scene.add(PlotControl.axisLines.y);
      GraphControl.scene.add(PlotControl.axisLines.z);
      GraphControl.render_three_js();
    }
    PlotControl.updateAxisScaleLabel(ranges);
    PlotControl.prev_ranges = ranges;
  }
  static getRangesOfFrustum(camera: THREE.OrthographicCamera): ComparableTriplet<Range> {
    let ranges = new ComparableTriplet<Range>(
      Range.getEmpty(),
      Range.getEmpty(),
      Range.getEmpty()
    );

    // Near Plane dimensions
    var hNear = (camera.top - camera.bottom) / camera.zoom;
    var wNear = (camera.right - camera.left) / camera.zoom;

    // Far Plane dimensions
    var hFar = hNear;
    var wFar = wNear;

    var p = camera.position.clone();
    var l = GraphControl.controls.target.clone();
    var u = new THREE.Vector3(0, 1, 0);

    var d = new THREE.Vector3();
    d.subVectors(l, p);
    d.normalize();

    var cross_d = u.clone();
    cross_d.cross(d);
    var rotate_axis = cross_d.clone();
    rotate_axis.normalize();
    var dot = u.dot(d);
    u.applyAxisAngle(rotate_axis, Math.acos(dot) - Math.PI / 2);

    var r = new THREE.Vector3();
    r.crossVectors(u, d);
    r.normalize();

    // Near Plane center
    var dTmp = d.clone();
    var nc = new THREE.Vector3();
    nc.addVectors(p, dTmp.multiplyScalar(camera.near));

    // Near Plane vertices
    var uTmp = u.clone();
    var rTmp = r.clone();
    var ntr = new THREE.Vector3();
    ntr.addVectors(nc, uTmp.multiplyScalar(hNear / 2));
    ntr.sub(rTmp.multiplyScalar(wNear / 2));

    uTmp.copy(u);
    rTmp.copy(r);
    var ntl = new THREE.Vector3();
    ntl.addVectors(nc, uTmp.multiplyScalar(hNear / 2));
    ntl.add(rTmp.multiplyScalar(wNear / 2));

    var nbr = new THREE.Vector3();
    uTmp.copy(u);
    rTmp.copy(r);
    nbr.subVectors(nc, uTmp.multiplyScalar(hNear / 2));
    nbr.sub(rTmp.multiplyScalar(wNear / 2));

    uTmp.copy(u);
    rTmp.copy(r);
    var nbl = new THREE.Vector3();
    nbl.subVectors(nc, uTmp.multiplyScalar(hNear / 2));
    nbl.add(rTmp.multiplyScalar(wNear / 2));


    // Far Plane center
    dTmp.copy(d);
    var fc = new THREE.Vector3();
    fc.addVectors(p, dTmp.multiplyScalar(camera.far));

    // Far Plane vertices
    uTmp.copy(u);
    rTmp.copy(r);
    var ftr = new THREE.Vector3();
    ftr.addVectors(fc, uTmp.multiplyScalar(hFar / 2));
    ftr.sub(rTmp.multiplyScalar(wFar / 2));

    uTmp.copy(u);
    rTmp.copy(r);
    var ftl = new THREE.Vector3();
    ftl.addVectors(fc, uTmp.multiplyScalar(hFar / 2));
    ftl.add(rTmp.multiplyScalar(wFar / 2));

    uTmp.copy(u);
    rTmp.copy(r);
    var fbr = new THREE.Vector3();
    fbr.subVectors(fc, uTmp.multiplyScalar(hFar / 2));
    fbr.sub(rTmp.multiplyScalar(wFar / 2));

    uTmp.copy(u);
    rTmp.copy(r);
    var fbl = new THREE.Vector3();
    fbl.subVectors(fc, uTmp.multiplyScalar(hFar / 2));
    fbl.add(rTmp.multiplyScalar(wFar / 2));

    GraphControl.camera.updateMatrix(); // make sure camera's local matrix is updated
    GraphControl.camera.updateMatrixWorld(); // make sure camera's world matrix is updated
    GraphControl.camera.matrixWorldInverse.getInverse(GraphControl.camera.matrixWorld);

    var frustum = new THREE.Frustum();
    var expansion_rate = 1.2; // to absorb the error caused by floating point arithmetic
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(GraphControl.camera.projectionMatrix, GraphControl.camera.matrixWorldInverse));

    const expandFrustum = (orig: THREE.Frustum) => {
      let expanded = orig.clone();
      const expandTwoPlanesOfFrustum = (plane1:THREE.Plane, plane2:THREE.Plane) => {
        var dot = plane1.normal.dot(plane2.normal);
        var rate = 1.1;

        if (dot * plane1.constant * plane2.constant > 0) {
          if (Math.abs(plane1.constant) > Math.abs(plane2.constant)) {
            plane1.constant *= rate;
            plane2.constant /= rate;
          }
          else {
            plane1.constant /= rate;
            plane2.constant *= rate;
          }
        }
        else {
          plane1.constant *= rate;
          plane2.constant *= rate;
        }
        return;
      }

      expandTwoPlanesOfFrustum(expanded.planes[0], expanded.planes[1]);
      expandTwoPlanesOfFrustum(expanded.planes[2], expanded.planes[3]);
      expandTwoPlanesOfFrustum(expanded.planes[4], expanded.planes[5]);
      return expanded;
    }
    frustum = expandFrustum(frustum);

    /// calculate cross point of the plane and three axes(x, y, z).
    /// The plane is defined by point_a, point_b, point_c and point_d.(The forth parameter is required to determine the range of the plane.)
    const calculate_intercept = (point_a: THREE.Vector3, point_b: THREE.Vector3, point_c: THREE.Vector3, point_d: THREE.Vector3, frustum: THREE.Frustum) => {
      var ab_vec = new THREE.Vector3().subVectors(point_b, point_a);
      var ac_vec = new THREE.Vector3().subVectors(point_c, point_a);
      var cross_product = ab_vec.clone().cross(ac_vec);
      var ret = new THREE.Vector3();
      var sum = cross_product.x * point_a.x + cross_product.y * point_a.y + cross_product.z * point_a.z;
      if (cross_product.x == 0) ret.x = 0;
      else ret.x = sum / cross_product.x;
      if (cross_product.y == 0) ret.y = 0;
      else ret.y = sum / cross_product.y;
      if (cross_product.z == 0) ret.z = 0;
      else ret.z = sum / cross_product.z;

      if (!frustum.containsPoint(new THREE.Vector3(ret.x, 0, 0))) ret.x = Number.NaN;
      if (!frustum.containsPoint(new THREE.Vector3(0, ret.y, 0))) ret.y = Number.NaN;
      if (!frustum.containsPoint(new THREE.Vector3(0, 0, ret.z))) ret.z = Number.NaN;
      return ret;
    };
    let intercepts = [
      // top surface
      calculate_intercept(ntr, ftr, ftl, ntl, frustum),
      // right surface
      calculate_intercept(ntr, nbr, fbr, ftr, frustum),
      // bottom surface
      calculate_intercept(nbr, nbl, fbl, fbr, frustum),
      // left surface
      calculate_intercept(ntl, nbl, fbl, ftl, frustum),
      // near surface 
      calculate_intercept(ntl, ntr, nbr, nbl, frustum),
      // far surface 
      calculate_intercept(ftl, ftr, fbr, fbl, frustum)
    ];

    var epsilon = 1e-8;
    var visible_x = Math.abs(d.y) + Math.abs(d.z) > epsilon,
      visible_y = Math.abs(d.z) + Math.abs(d.x) > epsilon,
      visible_z = Math.abs(d.x) + Math.abs(d.y) > epsilon;
    for (let ic of intercepts) {
      if (visible_x && !isNaN(ic.x)) {
        ranges.x.min = Math.min(ranges.x.min, ic.x);
        ranges.x.max = Math.max(ranges.x.max, ic.x);
      }
      if (visible_y && !isNaN(ic.y)) {
        ranges.y.min = Math.min(ranges.y.min, ic.y);
        ranges.y.max = Math.max(ranges.y.max, ic.y);
      }
      if (visible_z && !isNaN(ic.z)) {
        ranges.z.min = Math.min(ranges.z.min, ic.z);
        ranges.z.max = Math.max(ranges.z.max, ic.z);
      }
    }
    return ranges;
  }
  static makeAxis(range: Range, delta: number, color: THREE.Color) {
    var geometry = new THREE.Geometry();
    var material = new THREE.LineBasicMaterial({ vertexColors: true })
    // var i;
    // var start = Math.floor(range.min / delta) * delta;
    // var end = range.max;
    // for(i=start; i<=end; i+=delta){
    //   geometry.vertices.push(new THREE.Vector3(-1,0,i), new THREE.Vector3(1,0,i));
    //   geometry.colors.push(color,color);
    // }
    geometry.vertices.push(new THREE.Vector3(0, 0, range.min), new THREE.Vector3(0, 0, range.max));
    geometry.colors.push(color, color);
    var grid_obj = new THREE.Object3D();
    grid_obj.add(new THREE.LineSegments(geometry, material));
    return grid_obj;
  }

  static updateAxisScaleLabel(ranges: ComparableTriplet<Range>) {
    var canvas = <HTMLCanvasElement>document.getElementById('scaleLabelCanvas');
    if (!canvas || !canvas.getContext) {
      return false;
    }

    var ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!PlotControl.plot_settings.scaleLabelVisible) return;
    ctx.font = "20px 'Arial'";

    const sub = (range: Range, axisColor: string, embedFunc: (arg: number) => THREE.Vector3) => {
      const calculateScaleInterval = (range: Range) => {
        var log = Math.log(range.getInterval()) / Math.log(10);
        var floor = Math.floor(log);
        var fractional_part = log - floor;
        var scale_interval = Math.pow(10, floor) / 5;
        var log10_5 = 0.69;
        if (fractional_part > log10_5) scale_interval *= 5;
        if (scale_interval <= 0) return Number.MAX_VALUE;
        return scale_interval;
      }
      const calculateNumberOfDigits = (interval:number) => {
        let num = Math.floor(Math.log(interval) / Math.log(10));
        num = num > 0 ? 0 : -num;
        num = Math.max(num, 0);
        num = Math.min(num, 20);
        return num;
      }
      let scale_interval = calculateScaleInterval(range);
      let fixed = calculateNumberOfDigits(scale_interval);
      ctx.fillStyle = axisColor;
      let start = Math.floor(range.min / scale_interval) * scale_interval;

      for (let i = 0; start + i * scale_interval <= range.max; i++) {
        const current = start + i * scale_interval;
        const vec = embedFunc(current);
        const pos = GraphControl.toScreenPosition(vec);
        ctx.fillText(current.toFixed(fixed), pos.x, pos.y);
      }
    }

    sub(ranges.x, PlotControl.axisColors.x, (arg) => new THREE.Vector3(arg, 0, 0));
    sub(ranges.y, PlotControl.axisColors.y, (arg) => new THREE.Vector3(0, arg, 0));
    sub(ranges.z, PlotControl.axisColors.z, (arg) => new THREE.Vector3(0, 0, arg));
  }

  static setBackgroundColor(color: string) {
    let color_val = parseInt("0x" + color.substr(1));
    const b = color_val % 256;
    color_val /= 256;
    const g = color_val % 256;
    color_val /= 256;
    const r = color_val;
    const brightness = Math.min(255, 256 - Math.max(r, g, b));

    this.axisColors = axisColorBases.map((base) =>
      "#" + ("00" + Math.floor(base.r * brightness).toString(16)).slice(-2)
      + ("00" + Math.floor(base.g * brightness).toString(16)).slice(-2)
      + ("00" + Math.floor(base.b * brightness).toString(16)).slice(-2)
    );
    GraphControl.renderer.setClearColor(color);
    PlotControl.update_axes(true);
  }
}