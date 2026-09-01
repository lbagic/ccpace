# ccpace

See how fast you're burning through your Claude Code usage.

```
npx ccpace
```

## Example

```
you@example.com [Your Organization]
  ├ 5h:    31%   resets 19:09        in 4h 0m   11% ahead of pace
  ├ 7d:    67%   resets Sep 3 09:59  in 1d 18h
  └ Fable: 38%   resets Sep 3 09:59  in 1d 18h
```

A window is only flagged when you're **ahead of pace** — burning it faster than the clock is running it down. Windows you're comfortably under stay quiet.

## How it works

Reads your Claude Code OAuth credentials and hits the usage API. Lists every active limit window — the 5-hour session, the 7-day total, and any model-scoped weekly limits — with how much you've used and when it resets.

Colors are dropped automatically when output is piped, or when `NO_COLOR` is set.

## Install

Requires Node >= 18 and an active Claude Code login.

```
npm i -g ccpace
```
