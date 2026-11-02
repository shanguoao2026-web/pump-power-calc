#!/usr/bin/env node

import {
  DISPLAY_DECIMALS,
  type FlowUnit,
  type ImpellerType,
  type PumpResult,
  calculate,
  isFlowUnit,
  roundTo,
} from "./calc";

const DEFAULT_DENSITY_KG_M3 = 1000;
const DEFAULT_EFFICIENCY = 0.7;
const DEFAULT_MARGIN = 1.15;
const DEFAULT_FLOW_UNIT: FlowUnit = "m3h";

const VALUE_FLAGS = new Set([
  "--flow",
  "--flow-unit",
  "--head",
  "--density",
  "--eff",
  "--margin",
  "--rpm",
]);

export const HELP_TEXT = `pump-power-calc - size a centrifugal pump motor

Usage:
  pump-power-calc --flow <Q> --head <H> [options]

Options:
  --flow <Q>            Volume flow rate (required)
  --flow-unit <unit>    Flow unit: m3h (default), lpm, or m3s
  --head <H>            Pump head in metres (required)
  --density <rho>       Fluid density in kg/m3 (default 1000)
  --eff <eta>           Pump efficiency, 0 < eta <= 1 (default 0.7)
  --margin <k>          Motor safety factor (default 1.15)
  --rpm <n>             Rotational speed in rpm (optional)
  --json                Print JSON instead of a table
  --help                Show this help

Calculation:
  P_h (W)  = rho * g * Q * H    g = 9.81, Q in m3/s
  P_s (W)  = P_h / efficiency
  P_motor  = P_s * margin, then the next standard IEC size (kW)

With --rpm:
  n_q = n * sqrt(Q) / H^0.75
  n_q < 30         radial impeller
  30 <= n_q <= 80  mixed impeller
  n_q > 80         axial impeller

Standard IEC motor sizes (kW):
  0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15,
  18.5, 22, 30, 37, 45, 55, 75, 90, 110

Examples:
  pump-power-calc --flow 10 --head 30
  pump-power-calc --flow 10 --head 30 --rpm 2900
  pump-power-calc --flow 166.667 --flow-unit lpm --head 30 --json`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

interface CommonArgs {
  json: boolean;
  flowUnit: FlowUnit;
  density: number;
  efficiency: number;
  margin: number;
  rpm?: number;
}

export interface HelpArgs extends CommonArgs {
  help: true;
}

export interface RunArgs extends CommonArgs {
  help: false;
  flow: number;
  head: number;
}

export type ParsedArgs = HelpArgs | RunArgs;

export interface CliJson {
  flow: number;
  flowUnit: FlowUnit;
  flowM3s: number;
  flowM3h: number;
  headM: number;
  densityKgM3: number;
  efficiency: number;
  margin: number;
  hydraulicPowerW: number;
  shaftPowerW: number;
  recommendedMotorKw: number;
  standardMotorKw: number;
  rpm?: number;
  specificSpeed?: number;
  impeller?: ImpellerType;
}

function parsePositive(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !(n > 0)) {
    throw new UsageError(`${flag} must be a positive number`);
  }
  return n;
}

function parseEfficiency(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !(n > 0) || n > 1) {
    throw new UsageError("--eff must be greater than 0 and at most 1");
  }
  return n;
}

function parseFlowUnit(raw: string): FlowUnit {
  if (isFlowUnit(raw)) {
    return raw;
  }
  throw new UsageError("--flow-unit must be one of m3h, lpm, m3s");
}

function readValue(
  argv: readonly string[],
  index: number,
  flag: string,
  inline: string | undefined,
): { raw: string; index: number } {
  if (inline !== undefined) {
    if (inline.trim() === "") {
      throw new UsageError(`missing value for ${flag}`);
    }
    return { raw: inline.trim(), index };
  }
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) {
    throw new UsageError(`missing value for ${flag}`);
  }
  return { raw: next.trim(), index: index + 1 };
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.some((token) => token === "--help")) {
    return {
      help: true,
      json: false,
      flowUnit: DEFAULT_FLOW_UNIT,
      density: DEFAULT_DENSITY_KG_M3,
      efficiency: DEFAULT_EFFICIENCY,
      margin: DEFAULT_MARGIN,
    };
  }

  let json = false;
  let flow: number | undefined;
  let flowUnit: FlowUnit = DEFAULT_FLOW_UNIT;
  let head: number | undefined;
  let density = DEFAULT_DENSITY_KG_M3;
  let efficiency = DEFAULT_EFFICIENCY;
  let margin = DEFAULT_MARGIN;
  let rpm: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new UsageError(`unexpected argument ${token}`);
    }

    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);

    if (flag === "--json" || flag === "--help") {
      throw new UsageError(`${flag} does not take a value`);
    }
    if (!VALUE_FLAGS.has(flag)) {
      throw new UsageError(`unknown option ${flag}`);
    }

    const taken = readValue(argv, i, flag, inline);
    i = taken.index;
    const raw = taken.raw;

    switch (flag) {
      case "--flow":
        flow = parsePositive(raw, "--flow");
        break;
      case "--flow-unit":
        flowUnit = parseFlowUnit(raw);
        break;
      case "--head":
        head = parsePositive(raw, "--head");
        break;
      case "--density":
        density = parsePositive(raw, "--density");
        break;
      case "--eff":
        efficiency = parseEfficiency(raw);
        break;
      case "--margin":
        margin = parsePositive(raw, "--margin");
        break;
      case "--rpm":
        rpm = parsePositive(raw, "--rpm");
        break;
      default:
        throw new UsageError(`unknown option ${flag}`);
    }
  }

  if (flow === undefined) {
    throw new UsageError("--flow is required");
  }
  if (head === undefined) {
    throw new UsageError("--head is required");
  }

  const parsed: RunArgs = {
    help: false,
    json,
    flow,
    flowUnit,
    head,
    density,
    efficiency,
    margin,
  };
  if (rpm !== undefined) {
    parsed.rpm = rpm;
  }
  return parsed;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toPrecision(12)).toString();
}

function flowUnitLabel(unit: FlowUnit): string {
  switch (unit) {
    case "m3h":
      return "m3/h";
    case "lpm":
      return "L/min";
    case "m3s":
      return "m3/s";
    default: {
      const unexpected: never = unit;
      return String(unexpected);
    }
  }
}

export function buildJson(args: RunArgs, result: PumpResult): CliJson {
  const doc: CliJson = {
    flow: args.flow,
    flowUnit: args.flowUnit,
    flowM3s: result.flowM3s,
    flowM3h: roundTo(result.flowM3h, 6),
    headM: args.head,
    densityKgM3: args.density,
    efficiency: args.efficiency,
    margin: args.margin,
    hydraulicPowerW: roundTo(result.hydraulicPowerW, DISPLAY_DECIMALS.powerW),
    shaftPowerW: roundTo(result.shaftPowerW, DISPLAY_DECIMALS.powerW),
    recommendedMotorKw: roundTo(result.recommendedMotorKw, DISPLAY_DECIMALS.motorKw),
    standardMotorKw: result.standardMotorKw,
  };
  if (result.rpm !== undefined && result.specificSpeed !== undefined && result.impeller !== undefined) {
    doc.rpm = result.rpm;
    doc.specificSpeed = roundTo(result.specificSpeed, DISPLAY_DECIMALS.specificSpeed);
    doc.impeller = result.impeller;
  }
  return doc;
}

export function formatJson(args: RunArgs, result: PumpResult): string {
  return `${JSON.stringify(buildJson(args, result), null, 2)}\n`;
}

export function formatTable(args: RunArgs, result: PumpResult): string {
  const hydraulic = roundTo(result.hydraulicPowerW, DISPLAY_DECIMALS.powerW);
  const shaft = roundTo(result.shaftPowerW, DISPLAY_DECIMALS.powerW);
  const motor = roundTo(result.recommendedMotorKw, DISPLAY_DECIMALS.motorKw);
  const rows: Array<[string, string]> = [
    ["Flow", `${formatNumber(args.flow)} ${flowUnitLabel(args.flowUnit)}`],
    ["Flow (m3/s)", result.flowM3s.toFixed(DISPLAY_DECIMALS.flowM3s)],
    ["Head (m)", formatNumber(args.head)],
    ["Density (kg/m3)", formatNumber(args.density)],
    ["Efficiency", formatNumber(args.efficiency)],
    ["Margin", formatNumber(args.margin)],
    ["Hydraulic power (W)", hydraulic.toFixed(DISPLAY_DECIMALS.powerW)],
    ["Shaft power (W)", shaft.toFixed(DISPLAY_DECIMALS.powerW)],
    ["Recommended motor (kW)", motor.toFixed(DISPLAY_DECIMALS.motorKw)],
    ["Standard motor (kW)", formatNumber(result.standardMotorKw)],
  ];

  if (result.rpm !== undefined && result.specificSpeed !== undefined && result.impeller !== undefined) {
    const nq = roundTo(result.specificSpeed, DISPLAY_DECIMALS.specificSpeed);
    rows.push(
      ["Speed (rpm)", formatNumber(result.rpm)],
      ["Specific speed n_q", nq.toFixed(DISPLAY_DECIMALS.specificSpeed)],
      ["Impeller", result.impeller],
    );
  }

  const labelWidth = rows.reduce((width, [label]) => Math.max(width, label.length), "Quantity".length);
  const header = `${"Quantity".padEnd(labelWidth)}  Value`;
  const rule = `${"-".repeat(labelWidth)}  ${"-".repeat(12)}`;
  const body = rows.map(([label, value]) => `${label.padEnd(labelWidth)}  ${value}`);
  return ["Pump motor sizing", "=".repeat("Pump motor sizing".length), "", header, rule, ...body].join("\n") + "\n";
}

export function main(argv: readonly string[]): number {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${HELP_TEXT}\n`);
      return 0;
    }
    const input = {
      flow: args.flow,
      flowUnit: args.flowUnit,
      headM: args.head,
      densityKgM3: args.density,
      efficiency: args.efficiency,
      margin: args.margin,
      ...(args.rpm !== undefined ? { rpm: args.rpm } : {}),
    };
    const result = calculate(input);
    process.stdout.write(args.json ? formatJson(args, result) : formatTable(args, result));
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
