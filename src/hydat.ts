import { Construct, Constant, Plus } from "./parse";

const isHydatParameterPointRaw = (raw:HydatParameterRaw): raw is HydatParameterPointRaw => {
  return (raw as HydatParameterPointRaw).unique_value !== undefined;
}

const isHydatTimePPRaw = (raw:HydatTimeRaw): raw is HydatTimePPRaw => {
  return (raw as HydatTimePPRaw).time_point !== undefined;
}

const translate_parameter_map = (parameter_map: { [key: string]: HydatParameterRaw }) => {
  let map:{[key:string]:HydatParameter} = {};
  for (var key in parameter_map) {
    const p = parameter_map[key];
    if (isHydatParameterPointRaw(p)) {
      map[key] = new HydatParameterPoint(p.unique_value);
    } else {
      map[key] = new HydatParameterInterval(p.lower_bounds,p.upper_bounds);
    }
  }
  return map;
}

export class HydatException extends Error {
  constructor(message:string) {
    super();
    Object.defineProperty(this, 'name', {
      get: () => this.constructor.name,
    });
    Object.defineProperty(this, 'message', {
      get: () => message,
    });
  }
}

export class Hydat {
  name: string;
  first_phases: HydatPhase[];
  parameters: { [key: string]: HydatParameter };
  variables: string[];
  raw: HydatRaw;

  constructor(hydat: HydatRaw) {
    this.raw = hydat;
    this.name = hydat.name;
    this.variables = hydat.variables;
    this.first_phases = [];
    for (let ph of hydat.first_phases) {
      this.first_phases.push(new HydatPhase(ph));
    }
    this.parameters = translate_parameter_map(hydat.parameters);
  }
}

export interface HydatRaw{
  name: string;
  first_phases: HydatPhaseRaw[];
  parameters: { [key: string]: HydatParameterRaw };
  variables: string[];
}

export class HydatPhase {
  type: "PP" | "IP";
  time: HydatTime;
  variable_map: {[key:string]:Construct};
  parameter_maps: { [key: string]: HydatParameter }[];
  children: HydatPhase[];
  simulation_state: string;

  constructor(phase: HydatPhaseRaw) {
    this.simulation_state = phase.simulation_state;
    if (isHydatTimePPRaw(phase.time)) { // phase.type === "PP"
      this.type = "PP"
      this.time = new HydatTimePP(phase.time.time_point);
    } else {
      this.type = "IP"
      this.time = new HydatTimeIP(phase.time.start_time, phase.time.end_time);
    }
    
    this.variable_map = {};
    for (let key in phase.variable_map) {
      if (phase.variable_map[key].unique_value === undefined) {
        throw new HydatException(`webHydLa doesn't support ununique value in variable maps for ${key}`);
      }
      this.variable_map[key] = Construct.parse(phase.variable_map[key].unique_value/*, phase.variable_map*/);
    }

    this.parameter_maps = [];
    for (let map of phase.parameter_maps) {
      this.parameter_maps.push(translate_parameter_map(map));
    }

    this.children = [];
    for (let c of phase.children) {
      this.children.push(new HydatPhase(c));
    }
  }
}

interface HydatPhaseRaw {
  type: string
  time: HydatTimeRaw;
  variable_map:{[key:string]:HydatVariableRaw};
  parameter_maps: { [key: string]: HydatParameterRaw }[];
  children: HydatPhaseRaw[];
  simulation_state: string;
}

// abstract class HydatParameter {
//   static translate_map(parameter_map: { [key: string]: HydatParameterRaw }) {
//     let map:{[key:string]:HydatParameter} = {};
//     for (var key in parameter_map) {
//       const p = parameter_map[key];
//       if (parameter_map[key].unique_value === undefined) {
//         map[key] = new HydatParameterInterval(p.lower_bounds,p.upper_bounds);
//       } else {
//         map[key] = new HydatParameterPoint(p.unique_value);
//       }
//     }
//     return map;
//   }
// }

export type HydatParameter = HydatParameterPoint | HydatParameterInterval;
export class HydatParameterPoint{
  unique_value: Construct;

  constructor(unique_value:string) {
    this.unique_value = Construct.parse(unique_value);
  }
}
export class HydatParameterInterval{
  lower_bounds: { value: Construct }[];
  upper_bounds: { value: Construct }[];
  
  constructor(lower_bounds:{value:string}[],upper_bounds:{value:string}[]) {
    this.lower_bounds = [];
    this.upper_bounds = [];
    for (let lb of lower_bounds) {
      this.lower_bounds.push({
        value: Construct.parse(lb.value)
      });
    }
    for (let ub of upper_bounds) {
      this.upper_bounds.push({
        value: Construct.parse(ub.value)
      })
    }
  }
}

type HydatParameterRaw = HydatParameterPointRaw | HydatParameterIntervalRaw;

interface HydatParameterPointRaw{
  unique_value: string;
}

interface HydatParameterIntervalRaw{
  lower_bounds: { value: string }[];
  upper_bounds: { value: string }[];
}

type HydatTime = HydatTimePP | HydatTimeIP;

export class HydatTimePP{
  time_point: Construct;
  constructor(time_point:string) {
    this.time_point = Construct.parse(time_point);
  }
}

class HydatTimeIP{
  start_time: Construct;
  end_time: Construct;
  constructor(start_time: string, end_time?: string) {
    this.start_time = Construct.parse(start_time);
    if (end_time === undefined || end_time === "Infinity") {
      this.end_time = new Plus(new Constant(2), this.start_time);
    } else {
      this.end_time = Construct.parse(end_time);
    }
  }
}

interface HydatVariableRaw{
  unique_value:string;
}

type HydatTimeRaw = HydatTimePPRaw | HydatTimeIPRaw;
interface HydatTimePPRaw{
  time_point: string;
}
interface HydatTimeIPRaw{
  start_time: string;
  end_time: string;
}

// function apply_parameter_to_expr(expr: string, parameter_value_list: { [key: string]: string }) {
//   var ret_expr = expr;
//   for (let key in parameter_value_list) {
//     while (ret_expr.indexOf(key, 0) != -1) {
//       ret_expr = ret_expr.replace(key, parameter_value_list[key]);
//     }
//   }
//   return ret_expr;
// }