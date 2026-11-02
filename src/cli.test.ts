import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const CLI = path.join(__dirname, "cli.js");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: readonly string[]): RunResult {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("help", () => {
  it("prints usage and exits 0", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    for (const flag of ["--flow", "--flow-unit", "--head", "--density", "--eff", "--margin", "--rpm", "--json", "--help"]) {
      assert.ok(result.stdout.includes(flag), `help should mention ${flag}`);
    }
    assert.match(result.stdout, /m3h/);
    assert.match(result.stdout, /lpm/);
    assert.match(result.stdout, /m3s/);
    assert.match(result.stdout, /radial/);
    assert.match(result.stdout, /mixed/);
    assert.match(result.stdout, /axial/);
    assert.match(result.stdout, /9\.81/);
  });

  it("shows help even when other arguments are incomplete", () => {
    const result = run(["--flow", "--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
  });
});

describe("check values", () => {
  it("prints the water duty as a table", () => {
    const result = run(["--flow", "10", "--head", "30", "--rpm", "2900"]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Pump motor sizing/);
    assert.match(result.stdout, /Flow\s+10 m3\/h/);
    assert.match(result.stdout, /Hydraulic power \(W\)\s+817\.5/);
    assert.match(result.stdout, /Shaft power \(W\)\s+1167\.9/);
    assert.match(result.stdout, /Recommended motor \(kW\)\s+1\.343/);
    assert.match(result.stdout, /Standard motor \(kW\)\s+1\.5\b/);
    assert.match(result.stdout, /Specific speed n_q\s+11\.92/);
    assert.match(result.stdout, /Impeller\s+radial/);
    assert.doesNotMatch(result.stdout, /axial/);
  });

  it("prints the same duty as JSON", () => {
    const result = run(["--flow", "10", "--head", "30", "--rpm", "2900", "--json"]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      flow: 10,
      flowUnit: "m3h",
      flowM3s: 10 / 3600,
      flowM3h: 10,
      headM: 30,
      densityKgM3: 1000,
      efficiency: 0.7,
      margin: 1.15,
      hydraulicPowerW: 817.5,
      shaftPowerW: 1167.9,
      recommendedMotorKw: 1.343,
      standardMotorKw: 1.5,
      rpm: 2900,
      specificSpeed: 11.92,
      impeller: "radial",
    });
  });

  it("matches 166.667 L/min to the 10 m3/h check values", () => {
    const result = run([
      "--flow",
      "166.667",
      "--flow-unit",
      "lpm",
      "--head",
      "30",
      "--rpm",
      "2900",
      "--json",
    ]);
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout) as {
      flowM3h: number;
      hydraulicPowerW: number;
      shaftPowerW: number;
      recommendedMotorKw: number;
      standardMotorKw: number;
      specificSpeed: number;
      impeller: string;
    };
    assert.equal(body.flowM3h, 10.00002);
    assert.equal(body.hydraulicPowerW, 817.5);
    assert.equal(body.shaftPowerW, 1167.9);
    assert.equal(body.recommendedMotorKw, 1.343);
    assert.equal(body.standardMotorKw, 1.5);
    assert.equal(body.specificSpeed, 11.92);
    assert.equal(body.impeller, "radial");
  });

  it("accepts an explicit m3/s flow equal to 10 m3/h", () => {
    const hours = JSON.parse(run(["--flow", "10", "--head", "30", "--json"]).stdout) as { hydraulicPowerW: number; flowM3s: number };
    const seconds = JSON.parse(
      run(["--flow", String(10 / 3600), "--flow-unit", "m3s", "--head", "30", "--json"]).stdout,
    ) as { hydraulicPowerW: number; flowM3s: number; standardMotorKw: number };
    assert.equal(seconds.flowM3s, hours.flowM3s);
    assert.equal(seconds.hydraulicPowerW, 817.5);
    assert.equal(seconds.standardMotorKw, 1.5);
  });
});

describe("defaults and parsing", () => {
  it("applies density 1000, efficiency 0.7, and margin 1.15", () => {
    const implied = run(["--flow", "10", "--head", "30", "--json"]);
    const explicit = run([
      "--flow",
      "10",
      "--head",
      "30",
      "--density",
      "1000",
      "--eff",
      "0.7",
      "--margin",
      "1.15",
      "--flow-unit",
      "m3h",
      "--json",
    ]);
    assert.equal(implied.status, 0);
    assert.deepEqual(JSON.parse(implied.stdout), JSON.parse(explicit.stdout));
    const body = JSON.parse(implied.stdout) as { rpm?: number; specificSpeed?: number; impeller?: string };
    assert.equal(body.rpm, undefined);
    assert.equal(body.specificSpeed, undefined);
    assert.equal(body.impeller, undefined);
  });

  it("accepts --flag=value and lets a later flag win", () => {
    const result = run(["--flow=10", "--head=30", "--eff=0.5", "--eff=1", "--margin=1", "--json"]);
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout) as {
      efficiency: number;
      hydraulicPowerW: number;
      shaftPowerW: number;
      recommendedMotorKw: number;
      standardMotorKw: number;
    };
    assert.equal(body.efficiency, 1);
    assert.equal(body.hydraulicPowerW, 817.5);
    assert.equal(body.shaftPowerW, 817.5);
    assert.equal(body.recommendedMotorKw, 0.818);
    assert.equal(body.standardMotorKw, 1.1);
  });

  it("omits the speed rows when --rpm is not set", () => {
    const result = run(["--flow", "10", "--head", "30"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /817\.5/);
    assert.doesNotMatch(result.stdout, /Specific speed/);
    assert.doesNotMatch(result.stdout, /Impeller/);
  });
});

describe("validation", () => {
  const cases: Array<{ args: string[]; pattern: RegExp }> = [
    { args: [], pattern: /--flow is required/ },
    { args: ["--flow", "10"], pattern: /--head is required/ },
    { args: ["--head", "30"], pattern: /--flow is required/ },
    { args: ["--flow", "0", "--head", "30"], pattern: /--flow must be a positive number/ },
    { args: ["--flow", "-5", "--head", "30"], pattern: /--flow must be a positive number/ },
    { args: ["--flow", "abc", "--head", "30"], pattern: /--flow must be a positive number/ },
    { args: ["--flow", "10", "--head", "0"], pattern: /--head must be a positive number/ },
    { args: ["--flow", "10", "--head", "-1"], pattern: /--head must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--density", "0"], pattern: /--density must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--density", "-1"], pattern: /--density must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--eff", "0"], pattern: /--eff must be greater than 0 and at most 1/ },
    { args: ["--flow", "10", "--head", "30", "--eff", "1.01"], pattern: /--eff must be greater than 0 and at most 1/ },
    { args: ["--flow", "10", "--head", "30", "--eff", "-0.2"], pattern: /--eff must be greater than 0 and at most 1/ },
    { args: ["--flow", "10", "--head", "30", "--margin", "0"], pattern: /--margin must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--margin", "-1"], pattern: /--margin must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--rpm", "0"], pattern: /--rpm must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--rpm", "-10"], pattern: /--rpm must be a positive number/ },
    { args: ["--flow", "10", "--head", "30", "--flow-unit", "gpm"], pattern: /--flow-unit must be one of m3h, lpm, m3s/ },
    { args: ["--flow", "10", "--head", "30", "--unknown", "1"], pattern: /unknown option --unknown/ },
    { args: ["--flow"], pattern: /missing value for --flow/ },
    { args: ["--flow", "--head", "30"], pattern: /missing value for --flow/ },
    { args: ["10", "--head", "30"], pattern: /unexpected argument 10/ },
    { args: ["--flow", "10", "--head", "30", "--json=true"], pattern: /--json does not take a value/ },
  ];

  for (const testCase of cases) {
    const label = testCase.args.length === 0 ? "(no args)" : testCase.args.join(" ");
    it(`exits 1 for ${label}`, () => {
      const result = run(testCase.args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^error: /);
      assert.match(result.stderr, testCase.pattern);
    });
  }

  it("accepts efficiency of exactly 1", () => {
    const result = run(["--flow", "10", "--head", "30", "--eff", "1", "--json"]);
    assert.equal(result.status, 0);
    const body = JSON.parse(result.stdout) as { efficiency: number };
    assert.equal(body.efficiency, 1);
  });

  it("exits 1 when the duty is above the largest IEC motor", () => {
    const result = run(["--flow", "1000", "--flow-unit", "m3s", "--head", "100", "--eff", "1", "--margin", "1"]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^error: required motor power .* exceeds the largest standard IEC size \(110 kW\)/);
  });
});
