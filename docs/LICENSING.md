# Forge Licensing

Forge uses a local-first licensing model with explicit worker limits. This is not DRM. This is not anti-piracy. This is honest capability gating that matches how professionals actually work.

## What is a Worker?

A **worker** is a single Forge execution node. It:

- Has a stable, unique `worker_id`
- Sends periodic heartbeats to indicate it is alive
- Can execute proxy transcoding jobs
- Runs on a machine (physical or virtual)

An **active worker** is one that has sent a heartbeat within the last 60 seconds.

Multiple workers can run on different machines to distribute work. The number of workers you can run depends on your license tier.

## License Tiers

Forge has exactly three license tiers. No other tiers. No dynamic scaling. No "temporary boosts".

### FREE

- **Max workers:** 1
- **Monitoring:** Local only (no LAN exposure)
- **Intended for:** Evaluation and single-machine use

This is what you get without any license file or configuration. It's honest about what it provides.

### FREELANCE

- **Max workers:** 3
- **Monitoring:** LAN allowed
- **Intended for:** Individuals with spare machines, small teams

Good for freelancers who have a few machines and want to distribute work.

### FACILITY

- **Max workers:** Unlimited
- **Monitoring:** LAN allowed
- **Cloud admin:** Not implemented (flag only)
- **Intended for:** Post-production facilities, larger teams

For organizations that need to scale without artificial limits.

## How Licensing is Configured

### Option 1: Environment Variable

Set `FORGE_LICENSE_TYPE` to one of: `free`, `freelance`, `facility`

```bash
export FORGE_LICENSE_TYPE=freelance
```

This takes precedence over any license file.

### Option 2: License File

Create a file called `forge_license.json` in the working directory:

```json
{
  "license_type": "freelance",
  "notes": "Licensed for personal use"
}
```

### Option 3: Default

If neither is set, Forge uses the FREE tier by default.

## How Limits Are Enforced

### At Heartbeat Time

When a worker sends a heartbeat:

1. The enforcer counts currently active workers
2. If the count is below the limit, the worker is **accepted**
3. If the count is at or above the limit, the worker is **rejected**

A rejected worker:
- Is marked with status `rejected`
- Cannot execute jobs
- Receives an explicit rejection reason
- Is visible in the monitoring dashboard

### At Job Creation Time

When you try to create a job:

1. Forge checks if any eligible workers are available
2. If workers are at limit and none are active, job creation **fails**
3. The failure message explicitly states: "Worker limit reached for license tier: \<tier\>"

There is no:
- Partial acceptance
- Silent queueing
- Delayed rejection

## What Forge Will Do

When limits are exceeded, Forge will:

- **Reject excess workers** with an explicit `rejected` status
- **Log the reason** for rejection
- **Fail job creation** with a clear error message
- **Show limit status** in the monitoring dashboard
- **Allow retry** when a worker slot becomes available

## What Forge Will NOT Do

Forge will never:

- **Silently throttle** work
- **Randomly refuse** jobs
- **Misreport limits** or hide capacity
- **Pretend limits are technical** when they are policy
- **Phone home** or require network activation
- **Obfuscate** the license mechanism
- **Expire** licenses automatically
- **Implement grace periods** or "trial days"

## Real-World Usage

### Single Machine (FREE)

You run Forge on your editing workstation. One worker handles your jobs. No configuration needed.

### Small Team (FREELANCE)

You have 3 machines: your main workstation and 2 render nodes. Set `FORGE_LICENSE_TYPE=freelance` on each, and all three can process jobs.

### Post Facility (FACILITY)

You have a render farm with 20+ machines. Set `FORGE_LICENSE_TYPE=facility` and scale without limits.

## Monitoring Integration

The monitoring dashboard shows:

- Current license tier
- Maximum workers allowed
- Currently active workers
- Any rejected workers (with reasons)

This is read-only. There are no upgrade prompts or payment links.

## Technical Implementation

License enforcement is implemented in:

- `backend/licensing/license_model.py` - Tier definitions
- `backend/licensing/license_store.py` - Configuration loading
- `backend/licensing/license_enforcer.py` - Limit enforcement
- `backend/monitor/heartbeat.py` - Integration at heartbeat time
- `backend/job_creation.py` - Integration at job creation time

The code is readable. There is no encryption. There is no obfuscation.

## Anti-Features We Explicitly Avoid

These are not bugs or missing features. We deliberately do not implement:

- Online activation
- License expiry
- Grace periods
- Trial days
- Background enforcement retries
- Hidden limits
- Upgrade nag dialogs
- Payment integration

Forge is honest software for professionals who do honest work.
