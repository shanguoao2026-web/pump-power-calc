/**
 * Centrifugal pump hydraulic power and IEC motor selection.
 * Gravity is the value required by this tool (9.81), not 9.80665.
 */

export const GRAVITY_M_S2 = 9.81;

/** Standard IEC rated outputs used by this tool, in kW, ascending. */
export const IEC_MOTOR_SIZES_KW = [
  0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110,
] as const;

export const DISPLAY_DECIMALS = {
  powerW: 1,
  motorKw: 3,
  specificSpeed: 2,
  flowM3s: 6,
} as const;

export type FlowUnit = "m3h" | "lpm" | "m3s";
export type ImpellerType = "radial" | "mixed" | "axial";

export interface PumpInput {
  flow: number;
  flowUnit: FlowUnit;
  headM: number;
  densityKgM3: number;
  efficiency: number;
  margin: number;
  rpm?: number;
}

export interface PumpResult {
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

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export function isFlowUnit(value: string): value is FlowUnit {
  return value === "m3h" || value === "lpm" || value === "m3s";
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Convert a flow quantity to m3/s. 1 L/min = 1/60000 m3/s. */
export function toM3s(flow: number, unit: FlowUnit): number {
  switch (unit) {
    case "m3s":
      return flow;
    case "m3h":
      return flow / 3600;
    case "lpm":
      return flow / 60_000;
    default: {
      const unexpected: never = unit;
      throw new InputError(`flow unit must be one of m3h, lpm, m3s (received ${String(unexpected)})`);
    }
  }
}

/**
 * Metric specific speed n_q = n * sqrt(Q) / H^0.75.
 * Q is m3/s, H is m, n is rpm.
 */
export function specificSpeed(rpm: number, flowM3s: number, headM: number): number {
  return (rpm * Math.sqrt(flowM3s)) / Math.pow(headM, 0.75);
}

/** n_q < 30 radial, 30–80 mixed (inclusive), > 80 axial. Uses the unrounded n_q. */
export function impellerType(nq: number): ImpellerType {
  if (!Number.isFinite(nq) || nq < 0) {
    throw new InputError("specific speed must be a non-negative finite number");
  }
  if (nq < 30) {
    return "radial";
  }
  if (nq <= 80) {
    return "mixed";
  }
  return "axial";
}

/** Smallest IEC size greater than or equal to the required kilowatts. */
export function selectStandardMotorKw(requiredKw: number): number {
  if (!Number.isFinite(requiredKw) || !(requiredKw > 0)) {
    throw new InputError("recommended motor power must be a positive number");
  }
  for (const size of IEC_MOTOR_SIZES_KW) {
    if (size >= requiredKw - 1e-9) {
      return size;
    }
  }
  const largest = IEC_MOTOR_SIZES_KW[IEC_MOTOR_SIZES_KW.length - 1];
  if (largest === undefined) {
    throw new InputError("standard IEC motor list is empty");
  }
  throw new InputError(
    `required motor power ${requiredKw.toFixed(DISPLAY_DECIMALS.motorKw)} kW exceeds the largest standard IEC size (${largest} kW)`,
  );
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new InputError(`${name} must be a positive number`);
  }
}

function assertEfficiency(value: number): void {
  if (!Number.isFinite(value) || !(value > 0) || value > 1) {
    throw new InputError("efficiency must be greater than 0 and at most 1");
  }
}

export function calculate(input: PumpInput): PumpResult {
  if (!isFlowUnit(input.flowUnit)) {
    throw new InputError("flow unit must be one of m3h, lpm, m3s");
  }
  assertPositive("flow", input.flow);
  assertPositive("head", input.headM);
  assertPositive("density", input.densityKgM3);
  assertEfficiency(input.efficiency);
  assertPositive("margin", input.margin);
  if (input.rpm !== undefined) {
    assertPositive("rpm", input.rpm);
  }

  const flowM3s = toM3s(input.flow, input.flowUnit);
  const hydraulicPowerW = input.densityKgM3 * GRAVITY_M_S2 * flowM3s * input.headM;
  const shaftPowerW = hydraulicPowerW / input.efficiency;
  const recommendedMotorKw = (shaftPowerW * input.margin) / 1000;
  // Size from the unrounded kilowatts so display rounding cannot undersize the motor.
  const standardMotorKw = selectStandardMotorKw(recommendedMotorKw);

  const result: PumpResult = {
    flowM3s,
    flowM3h: flowM3s * 3600,
    headM: input.headM,
    densityKgM3: input.densityKgM3,
    efficiency: input.efficiency,
    margin: input.margin,
    hydraulicPowerW,
    shaftPowerW,
    recommendedMotorKw,
    standardMotorKw,
  };

  if (input.rpm !== undefined) {
    const nq = specificSpeed(input.rpm, flowM3s, input.headM);
    result.rpm = input.rpm;
    result.specificSpeed = nq;
    result.impeller = impellerType(nq);
  }

  return result;
}
