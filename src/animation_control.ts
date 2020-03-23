import { PlotLine } from "./plot_line";
import { PlotControl } from "./plot_control";
import { DOMControl } from "./dom_control";
import * as THREE from "three";
import { GraphControl } from "./graph_control";
import { HydatParameter, HydatParameterInterval, HydatPhase } from "./hydat";
import { RGB, Triplet } from "./plot_utils";
import { HydatControl } from "./hydat_control";
import { Construct, Constant } from "./parse";

export class AnimationControl {
  static maxlen: number = 0;
  static animation_line: { vecs: THREE.Vector3[], color: number }[] = []; // ボールの軌道のリスト

  static time: number = 0;
  static time_prev: number = -100;

  static plot_animate: THREE.Mesh[];

  static add_plot(line: PlotLine) {
    var axes: Triplet<Construct>;
    if (line.settings.x == "" ||
      line.settings.y == "" ||
      line.settings.z == "") {
      return;
    }
    try {
      axes = new Triplet<Construct>(
        Construct.parse(line.settings.x),
        Construct.parse(line.settings.y),
        Construct.parse(line.settings.z)
      );
      line.updateFolder(true);
    } catch (e) {
      console.log(e);
      console.log(e.stack);
      line.updateFolder(false);
      return;
    }
    if (HydatControl.current_hydat === undefined) {
      throw new Error("current_hydat is undefined");
    }
    var dt = PlotControl.plot_settings.plotInterval;
    var phase = HydatControl.current_hydat.first_phases[0];
    var parameter_condition_list = PlotControl.divideParameter(HydatControl.current_hydat.parameters);
    const getColors = (colorNum: number, colorAngle: number) => {
      var angle = 360 / colorNum;
      var angle_start = Math.floor(colorAngle);
      var retColors: number[] = [];
      for (var i = 0; i < colorNum; i++) {
        retColors.push(RGB.fromHue((Math.floor(angle * i) + angle_start) % 360).asHex24());
      }
      return retColors;
    };
    let color = getColors(parameter_condition_list.length, line.color_angle);
    line.plot_information = { phase_index_array: [{ phase: phase, index: 0 }], axes: axes, line: line, width: PlotControl.plot_settings.lineWidth, color: color, dt: dt, parameter_condition_list: parameter_condition_list };
    DOMControl.startPreloader();
    PlotControl.array = -1;
    this.animation_line = [];
    this.maxlen = 0;
    if (line.plot_ready == undefined) requestAnimationFrame(function () { line.plotReady() });
  }

  // startPosからendPosまで幅scaledWidthの線をgeometryに追加
  static make_line(startPos: any, endPos: any, scaledWidth: number) {
    var directionVec = endPos.clone().sub(startPos);
    var height = directionVec.length();
    directionVec.normalize();
    var cylinderMesh = new THREE.Mesh(new THREE.CylinderGeometry(scaledWidth, scaledWidth, height + scaledWidth, 8, 1));

    var upVec = new THREE.Vector3(0, 1, 0);
    var rotationAxis = upVec.clone().cross(directionVec).normalize();
    var rotationAngle = Math.acos(upVec.dot(directionVec));

    var newpos = startPos.clone().lerp(endPos, 0.5);
    cylinderMesh.position.set(newpos.x, newpos.y, newpos.z);
    cylinderMesh.setRotationFromAxisAngle(rotationAxis, rotationAngle);

    cylinderMesh.updateMatrix();
    return cylinderMesh;
  };

  static add_line(current_line_vec: { vec: THREE.Vector3, isPP: boolean }[], current_param_idx: number, line: PlotLine, width: number, color: number[]) {
    PlotControl.array += 1;

    var linesGeometry = new THREE.Geometry();
    let scaledWidth = 0.5 * width / GraphControl.camera.zoom;

    const dottedLength = 10.0 / GraphControl.camera.zoom;
    for (var i = 0; i + 1 < current_line_vec.length; i++) {
      if (current_line_vec[i + 1].isPP) {
        const posBegin = current_line_vec[i].vec;
        const posEnd = current_line_vec[i + 1].vec;
        let directionVec = posEnd.clone().sub(posBegin);
        const lineLength = directionVec.length();
        directionVec.normalize();
        const numOfDots = lineLength / dottedLength;
        for (var j = 1; j + 1 < numOfDots; j += 2) { // 点線の各点を追加
          let l = AnimationControl.make_line(
            posBegin.clone().add(directionVec.clone().multiplyScalar(j * dottedLength)),
            posBegin.clone().add(directionVec.clone().multiplyScalar((j + 1) * dottedLength)),
            scaledWidth
          );
          linesGeometry.merge(<any>l.geometry, l.matrix);
        }
      }
      else if (!current_line_vec[i].vec.equals(current_line_vec[i + 1].vec)) { // IPの各折れ線を追加
        let l = AnimationControl.make_line(current_line_vec[i], current_line_vec[i + 1], scaledWidth);
        linesGeometry.merge(<any>l.geometry, l.matrix);
      }
    }

    let three_line = new THREE.Mesh(
      linesGeometry,
      new THREE.MeshBasicMaterial({ color: color[current_param_idx] })
    );
    GraphControl.lineIDSet.add(three_line.id);
    GraphControl.scene.add(three_line);

    if (!line.plot) {
      throw new Error("unexpected: line.plot is undefined");
    }
    line.plot.push(three_line);

    AnimationControl.animation_line[PlotControl.array] = {
      vecs: PlotControl.current_line_vec_animation,
      color: color[current_param_idx]
    };
    if (AnimationControl.maxlen < PlotControl.current_line_vec_animation.length) {
      AnimationControl.maxlen = PlotControl.current_line_vec_animation.length;
    }

    // 動く点
    let s_geometry = new THREE.SphereGeometry(0.1);
    let s_material = new THREE.MeshBasicMaterial({ color: color[current_param_idx] });
    let sphere = new THREE.Mesh(s_geometry, s_material);
    sphere.position.set(0, 0, 0);
    GraphControl.scene.add(sphere);
    AnimationControl.plot_animate[PlotControl.array] = (sphere);
  }

  // dfs to add plot each line
  static dfs_each_line(phase_index_array: { phase: HydatPhase, index: number }[], axes: Triplet<Construct>, line: PlotLine, width: number, color: number[], dt: number, parameter_condition_list: { [key: string]: Constant; }[], current_param_idx: number, current_line_vec: { vec: THREE.Vector3, isPP: boolean }[]) {
    try {
      while (true) {
        if (line.plot_ready) {
          line.plotting = false;
          console.log("Plot is interrupted");
          PlotControl.PlotStartTime = undefined;
          return;
        }

        // phase_index_array is used to implement dfs without function call.
        let phase_index = phase_index_array[phase_index_array.length - 1]; // top
        let phase = phase_index.phase;
        let vec = PlotControl.phase_to_line_vectors(phase, parameter_condition_list[current_param_idx], axes, dt);
        current_line_vec = current_line_vec.concat(vec);
        let vec_animation = PlotControl.phase_to_line_vectors(phase, parameter_condition_list[current_param_idx], axes, 0.01); // tを0.01刻みで点を取る -> time = t * 100
        // PlotControl.current_line_vec_animation = PlotControl.current_line_vec_animation.concat(vec_animation);
        for (let v of vec_animation) {
          PlotControl.current_line_vec_animation.push(v.vec);
        }
        if (phase.children.length == 0) { // on leaves
          AnimationControl.add_line(current_line_vec, current_param_idx, line, width, color);

          current_line_vec = [];
          PlotControl.current_line_vec_animation = [];
          phase_index_array.pop();
          phase_index = phase_index_array[phase_index_array.length - 1];
          ++(phase_index.index);
          phase = phase_index.phase;
        }
        while2: while (true) {
          // search next child to plot
          for (/* restart searching */; phase_index.index < phase.children.length; phase_index.index++) {
            var child = phase.children[phase_index.index];
            var included_by_parameter_condition = AnimationControl.check_parameter_condition(child.parameter_maps, parameter_condition_list[current_param_idx]);
            if (included_by_parameter_condition) { // パラメータに含まれるchild，つまり描画するべきchildが見つかった
              phase_index_array.push({ phase: child, index: 0 }); // start from 0th child
              var current_time = new Date().getTime();
              if (current_time - line.last_plot_time >= 200) { // interrupt searching
                line.last_plot_time = current_time;
                // use setTimeout to check event queue
                requestAnimationFrame(function () {
                  AnimationControl.dfs_each_line(phase_index_array, axes, line, width, color, dt, parameter_condition_list, current_param_idx, current_line_vec)
                });
                return;
              }
              break while2; // go to child
            }
          }

          // 以下，描画するべきchildが見つからなかった場合
          // Plot for this current_param_idx is completed.
          if (phase_index_array.length == 1) {
            if (current_param_idx == parameter_condition_list.length - 1) { // last
              // Plot is completed.
              line.plotting = false;
              PlotControl.checkAndStopPreloader();
              return;
            }
            else {
              // setTimeout(function()
              //             {dfs_each_line([{phase:phase_index_array[0].phase, index:0}], axes, line, width, color, dt, parameter_condition_list, current_param_idx, [])
              //             }, 0);
              // 次のparameter conditionで探索しなおす
              ++current_param_idx;
              phase_index_array[0].index = 0;
              break;
            }
          } else {
            // go to parent phase
            phase_index_array.pop();
            phase_index = phase_index_array[phase_index_array.length - 1];
            ++(phase_index.index);
            phase = phase_index.phase; // start from next sibling
          }
        }
      }
    }
    catch (ex) {
      console.log(ex);
      console.log(ex.stack);
      DOMControl.showToast("Plot failed: " + ex.name +
        "(" + ex.message + ")", 3000, "red darken-4");
      line.plotting = false;
      PlotControl.checkAndStopPreloader();
    }
  }

  static remove_plot(line: PlotLine) {
    if (line.plot !== undefined) {
      for (var i = 0; i < line.plot.length; i++) {
        GraphControl.scene.remove(line.plot[i]);
        GraphControl.lineIDSet.delete(line.plot[i].id);
      }
      delete line.plot[i];
    }
    line.plot = [];
  }

  static remove_mesh(line: THREE.Mesh[] | undefined) {
    if (line !== undefined) {
      for (let i = 0; i < line.length; i++) {
        GraphControl.scene.remove(line[i]);
        delete line[i];
      }
      line.length = 0;
    }
  }

  static reset(line: PlotLine) {
    AnimationControl.remove_plot(line);
    AnimationControl.remove_mesh(AnimationControl.plot_animate);
    AnimationControl.add_plot(line);
  }

  static check_parameter_condition(parameter_maps: { [key: string]: HydatParameter }[], parameter_condition_list: { [key: string]: Constant }) {
    let epsilon = 0.0001;
    for (let map of parameter_maps) {
      let included = true;
      for (let key in map) {
        let p = map[key];
        let c = parameter_condition_list[key];
        if (c === undefined) continue;
        if (p instanceof HydatParameterInterval) {
          const lb = p.lower_bounds[0].value.getValue(parameter_condition_list);
          const ub = p.upper_bounds[0].value.getValue(parameter_condition_list);
          if (!(lb <= c.getValue(parameter_condition_list) + epsilon
            && ub >= c.getValue(parameter_condition_list) - epsilon)) {
            included = false;
          }
        } else if (!(p.unique_value.getValue(parameter_condition_list) <= c.getValue(parameter_condition_list) + epsilon
          && p.unique_value.getValue(parameter_condition_list) >= c.getValue(parameter_condition_list) - epsilon)) {
          included = false;
        }
      }
      if (included) {
        return true;
      }
    }
    return false;
  }

  static range_make_all() {
    if (GraphControl.face_a != undefined) {
      AnimationControl.remove_mesh(GraphControl.face_a);
    }
    GraphControl.face_a = [];
    if (AnimationControl.animation_line.length != 0) {
      for (let j = 0; j < AnimationControl.animation_line.length - 1; j++) {
        var face_geometry = new THREE.Geometry();
        var time_r = 0;
        for (let i = 0; i < AnimationControl.maxlen; i++) {
          if (AnimationControl.animation_line[j].vecs[time_r] == undefined) {
            break;
          } else if (AnimationControl.animation_line[j + 1].vecs[time_r] == undefined) {
            break;
          } else {
            face_geometry.vertices.push(new THREE.Vector3(AnimationControl.animation_line[j].vecs[time_r].x, AnimationControl.animation_line[j].vecs[time_r].y, AnimationControl.animation_line[j].vecs[time_r].z));
            face_geometry.vertices.push(new THREE.Vector3(AnimationControl.animation_line[j + 1].vecs[time_r].x, AnimationControl.animation_line[j + 1].vecs[time_r].y, AnimationControl.animation_line[j + 1].vecs[time_r].z));
          }
          time_r++;
        }
        for (let k = 0; k < face_geometry.vertices.length - 2; k++) {
          face_geometry.faces.push(new THREE.Face3(k, (k + 1), (k + 2)));
        }
        face_geometry.computeFaceNormals();
        face_geometry.computeVertexNormals();
        let face_all = new THREE.Mesh(face_geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: true, transparent: true, side: THREE.DoubleSide, opacity: 0.5 }));
        GraphControl.scene.add(face_all);
        GraphControl.face_a.push(face_all);
      }
      GraphControl.render_three_js();
    }
  }

  static animate() {
    if (this.time_prev !== this.time) {
      AnimationControl.plot_animate = [];
      let arr = 0;
      for (let i = 0; i < GraphControl.scene.children.length - 1; i++) {
        // if ('isLine' in GraphControl.scene.children[i]) {
        if (GraphControl.lineIDSet.has(GraphControl.scene.children[i].id)) {
          let next_sphere = GraphControl.scene.children[i + 1];
          if (!(next_sphere instanceof THREE.Mesh)) {
            console.error("unexpected: !(next_sphere instanceof THREE.Mesh)")
            continue;
          }
          if (AnimationControl.animation_line[arr] === undefined) {
            continue;
          }
          if (this.time > AnimationControl.maxlen - 1) {
            this.time = 0;
          }
          if (!(next_sphere.material instanceof THREE.MeshBasicMaterial)) {
            console.error("unexpected: !(next_sphere.material instanceof THREE.MeshBasicMaterial)")
            continue;
          }
          if (this.time === 0) {
            next_sphere.material.color.set(
              AnimationControl.animation_line[arr].color
            );
          }
          if (this.time > AnimationControl.animation_line[arr].vecs.length - 1) {
            next_sphere.material.color.set(
              new RGB(198, 198, 198).asHex24()
            );
            AnimationControl.plot_animate[arr] = next_sphere;
            arr++;
            continue;
          }
          next_sphere.position.set(
            AnimationControl.animation_line[arr].vecs[this.time].x,
            AnimationControl.animation_line[arr].vecs[this.time].y,
            AnimationControl.animation_line[arr].vecs[this.time].z);
          AnimationControl.plot_animate[arr] = next_sphere;
          arr += 1;
        }
      }
      this.time_prev = this.time;
      GraphControl.render_three_js();
    }
  }

  static animateTime() {
    this.time++;
  }

  static getLength() {
    return this.animation_line.length;
  }
}