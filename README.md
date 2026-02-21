# Roza CLI

Roza CLI is a clean, minimal terminal app for Ramadan schedules and prayer tracking.

## Features
- Automatic first-run setup with location detection, methods, and timezone
- Daily prayer schedule with a clean table and current/upcoming highlights
- Prayer attendance tracking (mark today’s prayers)
- Backfill past dates with validation and reminders
- Ramadan-only history view with Hijri date range
- Full recap with consistency summary and grid visualization
- Works with the Aladhan API

## Getting Started

```sh
npm install
npm run build
node dist/cli.js schedule
```

## Dev Shortcut

```sh
npm run dev:schedule
```

## Commands

```sh
node dist/cli.js schedule   # show schedule
node dist/cli.js mark       # mark today’s prayers
node dist/cli.js backfill   # update past date
node dist/cli.js history    # view attendance history
node dist/cli.js recap      # recap consistency
node dist/cli.js reset      # reset config
```

## Ramadan History & Recap

```sh
node dist/cli.js history --ramadan
node dist/cli.js recap --ramadan
```

## Reset Config

```sh
node dist/cli.js reset
```

## License
MIT

Created by rbayuokt
