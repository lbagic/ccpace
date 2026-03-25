# ccpace

See how fast you're burning through your Claude Code usage.

```
npx ccpace
```

## Example

```
5h  ██████████████████████████████████████░░░░░░▓░░░░░░
    78% used · 88.2% expected · 10.2% under budget
    35m left · 22% remaining · 0.0h per 1%

7d  █████████████████████████████████████░░▓░░░░░░░░░░░
    74% used · 79.4% expected · 5.4% under budget
    1d 10h left · 26% remaining · 1.3h per 1%
```

**Green** = under budget. **Red** = over budget. The `▓` marker shows where you *should* be based on time elapsed.

## How it works

Reads your Claude Code OAuth credentials and hits the usage API. Shows your 5-hour and 7-day windows with a pacing bar so you can tell at a glance if you need to slow down.

## Install

Requires Node >= 18 and an active Claude Code login.

```
npm i -g ccpace
```
