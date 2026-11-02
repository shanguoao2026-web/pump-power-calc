# pump-power-calc

Build a small TypeScript Node CLI (Node 18+, no runtime deps; devDeps typescript + @types/node only; tests with node:test) that sizes a centrifugal pump motor.

Features:
- Inputs: --flow Q with --flow-unit m3h (default) | lpm | m3s; --head H in m; --density (kg/m3, default 1000); --eff pump efficiency 0–1 (default 0.7); --margin motor safety factor (default 1.15); optional --rpm n.
- Compute: hydraulic power P_h = rho * g * Q * H (g = 9.81, Q in m3/s), shaft power P_s = P_h / eff, recommended motor power = P_s * margin, and pick the next standard IEC motor size from this list (kW): 0.37 0.55 0.75 1.1 1.5 2.2 3 4 5.5 7.5 11 15 18.5 22 30 37 45 55 75 90 110.
- With --rpm: specific speed n_q = n * sqrt(Q) / H^0.75 (Q m3/s, H m) and a rough impeller type note (n_q < 30 radial, 30–80 mixed, > 80 axial).
- Validation with clear errors (positive numbers, 0 < eff <= 1) and exit code 1. Table output by default, --json, --help.
- README with examples, MIT LICENSE (author shanguoao2026-web), .gitignore with node_modules/ dist/ *.log.
- npm test must build and pass. No secrets, no personal info.

Check values: Q 10 m3/h, H 30 m, water, eff 0.7, margin 1.15 → P_h 817.5 W, P_s 1167.9 W, motor 1.343 kW → standard 1.5 kW; rpm 2900 → n_q 11.92 (radial). Q 166.667 lpm equals 10 m3/h.
