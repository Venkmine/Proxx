# Attaching Proxies in DaVinci Resolve

This guide explains how to manually attach Forge-generated proxies to your media in DaVinci Resolve.

---

## What Forge Guarantees

- ✅ Proxies are generated with matching timecode and frame count
- ✅ Proxies use NLE-compatible codecs (ProRes, DNxHD/HR)
- ✅ Output filenames follow your naming template
- ✅ Proxies are placed in your specified output directory

## What Forge Does NOT Do

- ❌ Forge never modifies your Resolve project or database
- ❌ Forge does not automatically link proxies to media
- ❌ Forge does not import media into your timeline
- ❌ Forge does not touch your original camera files

---

## Step-by-Step: Attach Proxies in Resolve

### Method 1: Link Proxy Media (Recommended)

1. **Open your project** in DaVinci Resolve
2. **Navigate to the Media Pool** containing your original clips
3. **Select the clip(s)** you want to attach proxies to
4. **Right-click** and choose **"Link Proxy Media..."**
5. **Navigate** to your Forge output directory
6. **Select the matching proxy file** for each clip
7. Click **"Open"** to complete the link

### Method 2: Batch Link via Folder

1. **Select multiple clips** in the Media Pool
2. **Right-click** → **"Link Proxy Media..."**
3. **Navigate** to the Forge output folder
4. Resolve will attempt to **auto-match by filename**
5. Verify matches and click **"Link"**

### Method 3: Using the Proxy Menu

1. Go to **Playback** → **Proxy Handling** → **Prefer Proxies**
2. Right-click clip → **"Link Proxy Media..."**
3. Select proxy files from Forge output directory

---

## Switching Between Proxy and Original

Once proxies are linked:

- **Playback** → **Proxy Handling** → **Prefer Proxies** (use proxies)
- **Playback** → **Proxy Handling** → **Prefer Camera Originals** (use originals)

For export, Resolve automatically uses original media regardless of playback setting.

---

## Common Failure Reasons

| Issue | Cause | Solution |
|-------|-------|----------|
| "No matching proxy found" | Filename mismatch | Ensure naming template produces matching names |
| Proxy won't link | Frame count mismatch | Re-generate proxy; check source wasn't trimmed |
| Timecode drift | Source has variable frame rate | Use constant frame rate source or CFR transcode first |
| "Unsupported format" | Wrong codec for Resolve version | Use ProRes 422 Proxy or DNxHD LB |
| Black frames at end | Proxy shorter than original | Verify source file integrity before re-generating |

---

## Recommended Forge Settings for Resolve

| Setting | Recommended Value |
|---------|-------------------|
| Proxy Profile | `proxy_prores_proxy_resolve` |
| Naming Template | `{source_name}_proxy` or `{source_name}` |
| Resolution | Match project (e.g., 1920x1080) |

---

## Verification Checklist

Before attaching proxies, verify:

- [ ] Proxy file exists in output directory
- [ ] Proxy filename matches original (per your template)
- [ ] Proxy duration matches original clip
- [ ] Proxy opens correctly in QuickTime/VLC

---

## Troubleshooting

### Proxy plays but original shows "Media Offline"

This is normal if original media is on disconnected storage. Proxies are independent files.

### Resolve shows wrong proxy

1. Right-click clip → **"Unlink Proxy Media"**
2. Re-link to correct proxy file

### Proxies not available after project reopen

Proxy links are stored in the Resolve database. If proxy files were moved:
1. Unlink proxies
2. Re-link from new location

---

## Further Reading

- [Resolve Manual: Proxy Workflows](https://documents.blackmagicdesign.com/)
- Forge documentation: `docs/PROXY_PROFILES.md`
