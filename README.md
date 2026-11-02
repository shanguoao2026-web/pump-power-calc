# pump-power-calc

Command-line tool that sizes a centrifugal pump motor from flow, head, and pump efficiency. It estimates hydraulic power and shaft power, applies a motor safety factor, and picks the next standard IEC rated output.

Node.js 18 or newer. The program has no runtime dependencies.

## Install and test

```bash
npm install
npm test
```

`npm test` compiles TypeScript and runs the `node:test` suite.

Run the calculator from the build output:

```bash
node dist/cli.js --help
```

## Usage

```text
pump-power-calc --flow <Q> --head <H> [options]
```

| Option | Meaning | Default |
| --- | --- | --- |
| `--flow <Q>` | Volume flow rate | required |
| `--flow-unit <unit>` | `m3h`, `lpm`, or `m3s` | `m3h` |
| `--head <H>` | Pump head in metres | required |
| `--density <rho>` | Fluid density in kg/m3 | `1000` |
| `--eff <eta>` | Pump efficiency, `0 < eta <= 1` | `0.7` |
| `--margin <k>` | Motor safety factor | `1.15` |
| `--rpm <n>` | Rotational speed in rpm | omitted |
| `--json` | Print JSON instead of a table | table |
| `--help` | Show help | |

Flow, head, density, margin, and rpm must be positive. Efficiency must be greater than 0 and at most 1. Invalid input prints `error: ...` on stderr and exits with code 1.

A later repeat of the same flag replaces the earlier value. `--flow=10` and `--flow 10` are both accepted.

## Calculation

`g` is 9.81 m/s². Flow is converted to m³/s before the power equations (`m3h / 3600`, `lpm / 60000`).

```text
P_h (W) = rho * g * Q * H
P_s (W) = P_h / efficiency
P_motor = P_s * margin
```

The recommended motor power is the smallest standard IEC size below that is greater than or equal to `P_motor`. The comparison uses the unrounded kilowatts.

```text
0.37  0.55  0.75  1.1  1.5  2.2  3  4  5.5  7.5  11
15  18.5  22  30  37  45  55  75  90  110
```

If the duty is above 110 kW, the program exits with code 1.

With `--rpm`, metric specific speed is:

```text
n_q = n * sqrt(Q) / H^0.75
```

`Q` is m³/s, `H` is metres, and `n` is rpm. The impeller note uses the unrounded `n_q`:

| n_q | Impeller |
| --- | --- |
| `< 30` | radial |
| `30` to `80`, inclusive | mixed |
| `> 80` | axial |

The table and JSON show hydraulic and shaft power to 0.1 W, recommended motor power to 0.001 kW, and specific speed to 0.01. JSON `flowM3h` is shown to 0.000001 m3/h. `flowM3s` stays at the full converted value, and motor selection uses the unrounded power.

## Examples

Water, 10 m³/h, 30 m head, efficiency 0.7, margin 1.15, 2900 rpm:

```bash
node dist/cli.js --flow 10 --head 30 --rpm 2900
```

```text
Pump motor sizing
=================

Quantity                Value
----------------------  ------------
Flow                    10 m3/h
Flow (m3/s)             0.002778
Head (m)                30
Density (kg/m3)         1000
Efficiency              0.7
Margin                  1.15
Hydraulic power (W)     817.5
Shaft power (W)         1167.9
Recommended motor (kW)  1.343
Standard motor (kW)     1.5
Speed (rpm)             2900
Specific speed n_q      11.92
Impeller                radial
```

That duty is hydraulic power 817.5 W, shaft power 1167.9 W, recommended motor 1.343 kW, standard motor 1.5 kW, specific speed 11.92 (radial).

The same flow as litres per minute. 10 m³/h is 166.6… L/min, which rounds to 166.667 L/min and matches the figures above at the displayed precision:

```bash
node dist/cli.js --flow 166.667 --flow-unit lpm --head 30 --rpm 2900 --json
```

```json
{
  "flow": 166.667,
  "flowUnit": "lpm",
  "flowM3s": 0.0027777833333333334,
  "flowM3h": 10.00002,
  "headM": 30,
  "densityKgM3": 1000,
  "efficiency": 0.7,
  "margin": 1.15,
  "hydraulicPowerW": 817.5,
  "shaftPowerW": 1167.9,
  "recommendedMotorKw": 1.343,
  "standardMotorKw": 1.5,
  "rpm": 2900,
  "specificSpeed": 11.92,
  "impeller": "radial"
}
```

JSON for the 10 m³/h case:

```bash
node dist/cli.js --flow 10 --head 30 --rpm 2900 --json
```

```json
{
  "flow": 10,
  "flowUnit": "m3h",
  "flowM3s": 0.002777777777777778,
  "flowM3h": 10,
  "headM": 30,
  "densityKgM3": 1000,
  "efficiency": 0.7,
  "margin": 1.15,
  "hydraulicPowerW": 817.5,
  "shaftPowerW": 1167.9,
  "recommendedMotorKw": 1.343,
  "standardMotorKw": 1.5,
  "rpm": 2900,
  "specificSpeed": 11.92,
  "impeller": "radial"
}
```

## License

MIT. Copyright (c) 2026 shanguoao2026-web.
