import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GRAVITY_M_S2,
  IEC_MOTOR_SIZES_KW,
  InputError,
  calculate,
  impellerType,
  roundTo,
  selectStandardMotorKw,
  specificSpeed,
  toM3s,
  type PumpInput,
} from "./calc";

const WATER_CASE: PumpInput = {
  flow: 10,
  flowUnit: "m3h",
  headM: 30,
  densityKgM3: 1000,
  efficiency: 0.7,
  margin: 1.15,
  rpm: 2900,
};

describe("check values", () => {
  it("sizes 10 m3/h at 30 m for water at eff 0.7 and margin 1.15", () => {
    const result = calculate(WATER_CASE);

    assert.equal(GRAVITY_M_S2, 9.81);
    assert.equal(result.flowM3s, 10 / 3600);
    assert.equal(result.flowM3h, 10);
    assert.equal(result.hydraulicPowerW, 817.5);
    assert.equal(roundTo(result.shaftPowerW, 1), 1167.9);
    assert.equal(roundTo(result.recommendedMotorKw, 3), 1.343);
    assert.equal(result.standardMotorKw, 1.5);
    assert.ok(Math.abs(result.shaftPowerW - 817.5 / 0.7) < 1e-9);
    assert.ok(Math.abs(result.recommendedMotorKw - (817.5 / 0.7) * 1.15 / 1000) < 1e-12);
  });

  it("reports n_q 11.92 and a radial impeller at 2900 rpm", () => {
    const result = calculate(WATER_CASE);
    assert.ok(result.specificSpeed !== undefined);
    assert.equal(roundTo(result.specificSpeed, 2), 11.92);
    assert.equal(result.impeller, "radial");
    assert.equal(
      result.specificSpeed,
      specificSpeed(2900, 10 / 3600, 30),
    );
  });

  it("treats 166.667 L/min as 10 m3/h at display precision", () => {
    const fromHours = calculate(WATER_CASE);
    const fromLitres = calculate({ ...WATER_CASE, flow: 166.667, flowUnit: "lpm" });

    assert.ok(Math.abs(fromLitres.flowM3h - 10) < 1e-4);
    assert.equal(roundTo(fromLitres.hydraulicPowerW, 1), roundTo(fromHours.hydraulicPowerW, 1));
    assert.equal(roundTo(fromLitres.shaftPowerW, 1), roundTo(fromHours.shaftPowerW, 1));
    assert.equal(roundTo(fromLitres.recommendedMotorKw, 3), roundTo(fromHours.recommendedMotorKw, 3));
    assert.equal(fromLitres.standardMotorKw, fromHours.standardMotorKw);
    assert.equal(roundTo(fromLitres.specificSpeed ?? NaN, 2), roundTo(fromHours.specificSpeed ?? NaN, 2));
    assert.equal(fromLitres.impeller, "radial");
  });
});

describe("flow conversion", () => {
  it("converts m3/h, L/min, and m3/s onto m3/s", () => {
    assert.equal(toM3s(1, "m3s"), 1);
    assert.equal(toM3s(3600, "m3h"), 1);
    assert.equal(toM3s(60_000, "lpm"), 1);
    assert.equal(toM3s(10, "m3h"), 10 / 3600);
  });

  it("uses density, efficiency, and margin in the power equations", () => {
    const result = calculate({
      flow: 1,
      flowUnit: "m3s",
      headM: 1,
      densityKgM3: 1000,
      efficiency: 1,
      margin: 1,
    });
    assert.equal(result.hydraulicPowerW, 9810);
    assert.equal(result.shaftPowerW, 9810);
    assert.equal(result.recommendedMotorKw, 9.81);
    assert.equal(result.standardMotorKw, 11);
    assert.equal(result.rpm, undefined);
    assert.equal(result.specificSpeed, undefined);
    assert.equal(result.impeller, undefined);
  });
});

describe("IEC motor size", () => {
  it("uses the specified size list", () => {
    assert.deepEqual(
      [...IEC_MOTOR_SIZES_KW],
      [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110],
    );
  });

  it("picks the smallest size that covers the required power", () => {
    assert.equal(selectStandardMotorKw(0.01), 0.37);
    assert.equal(selectStandardMotorKw(0.37), 0.37);
    assert.equal(selectStandardMotorKw(0.3700001), 0.55);
    assert.equal(selectStandardMotorKw(1.5), 1.5);
    assert.equal(selectStandardMotorKw(1.5000001), 2.2);
    assert.equal(selectStandardMotorKw(110), 110);
  });

  it("does not let 0.001 kW display rounding hide a size step", () => {
    const result = calculate({
      flow: 1500.4 / 9810,
      flowUnit: "m3s",
      headM: 1,
      densityKgM3: 1000,
      efficiency: 1,
      margin: 1,
    });
    assert.equal(roundTo(result.recommendedMotorKw, 3), 1.5);
    assert.ok(result.recommendedMotorKw > 1.5);
    assert.equal(result.standardMotorKw, 2.2);
  });

  it("rejects a duty above 110 kW", () => {
    assert.throws(
      () => selectStandardMotorKw(110.001),
      (err: unknown) => err instanceof InputError && /110 kW/.test(err.message),
    );
    assert.throws(
      () =>
        calculate({
          flow: 1000,
          flowUnit: "m3s",
          headM: 100,
          densityKgM3: 1000,
          efficiency: 1,
          margin: 1,
        }),
      /exceeds the largest standard IEC size \(110 kW\)/,
    );
  });
});

describe("impeller type", () => {
  it("classifies the boundaries from the unrounded specific speed", () => {
    assert.equal(impellerType(0), "radial");
    assert.equal(impellerType(29.999), "radial");
    assert.equal(impellerType(30), "mixed");
    assert.equal(impellerType(80), "mixed");
    assert.equal(impellerType(80.001), "axial");
  });

  it("keeps a true n_q of 29.999 radial even though it displays as 30.00", () => {
    const result = calculate({
      flow: 1,
      flowUnit: "m3s",
      headM: 1,
      densityKgM3: 1000,
      efficiency: 1,
      margin: 1,
      rpm: 29.999,
    });
    assert.equal(result.specificSpeed, 29.999);
    assert.equal(roundTo(result.specificSpeed ?? NaN, 2), 30);
    assert.equal(result.impeller, "radial");
  });

  it("follows rpm when Q is 1 m3/s and H is 1 m", () => {
    const base = {
      flow: 1,
      flowUnit: "m3s" as const,
      headM: 1,
      densityKgM3: 1000,
      efficiency: 1,
      margin: 1,
    };
    assert.equal(calculate({ ...base, rpm: 30 }).impeller, "mixed");
    assert.equal(calculate({ ...base, rpm: 80 }).impeller, "mixed");
    assert.equal(calculate({ ...base, rpm: 80.1 }).impeller, "axial");
  });
});

describe("validation", () => {
  it("rejects non-positive inputs and efficiency outside (0, 1]", () => {
    const base = { ...WATER_CASE };
    const bad: Array<PumpInput> = [
      { ...base, flow: 0 },
      { ...base, flow: -1 },
      { ...base, headM: 0 },
      { ...base, densityKgM3: 0 },
      { ...base, efficiency: 0 },
      { ...base, efficiency: 1.01 },
      { ...base, margin: 0 },
      { ...base, rpm: 0 },
    ];
    for (const input of bad) {
      assert.throws(() => calculate(input), InputError);
    }
    assert.equal(calculate({ ...base, efficiency: 1, rpm: undefined }).efficiency, 1);
  });
});
