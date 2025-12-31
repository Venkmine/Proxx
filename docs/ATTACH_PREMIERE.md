# Attaching Proxies in Adobe Premiere Pro

This guide explains how to manually attach Forge-generated proxies to your media in Adobe Premiere Pro.

---

## What Forge Guarantees

- ✅ Proxies are generated with matching timecode and frame count
- ✅ Proxies use NLE-compatible codecs (ProRes, DNxHD/HR, H.264)
- ✅ Output filenames follow your naming template
- ✅ Proxies are placed in your specified output directory

## What Forge Does NOT Do

- ❌ Forge never modifies your Premiere project (.prproj)
- ❌ Forge does not automatically link proxies to media
- ❌ Forge does not import media into your project
- ❌ Forge does not touch your original camera files

---

## Step-by-Step: Attach Proxies in Premiere Pro

### Method 1: Attach Proxies (Single Clip)

1. **Open your project** in Premiere Pro
2. **Navigate to the Project panel** containing your original clips
3. **Right-click** the clip you want to attach a proxy to
4. Select **"Proxy"** → **"Attach Proxies..."**
5. **Navigate** to your Forge output directory
6. **Select the matching proxy file**
7. Click **"OK"** to complete the attachment

### Method 2: Batch Attach Proxies

1. **Select multiple clips** in the Project panel (Cmd+Click or Shift+Click)
2. **Right-click** → **"Proxy"** → **"Attach Proxies..."**
3. **Navigate** to the Forge output folder
4. Premiere will attempt to **auto-match by filename**
5. Review matches in the dialog
6. Click **"Attach"** to confirm

### Method 3: Using Ingest Settings (New Projects)

For new projects, configure ingest to copy proxies:

1. **File** → **Project Settings** → **Ingest Settings**
2. Enable **"Ingest"**
3. Set **"Copy and Create Proxies"** or **"Create Proxies"**
4. Point proxy destination to Forge output folder

> **Note:** This method is for new imports only. For existing media, use Method 1 or 2.

---

## Switching Between Proxy and Original

Once proxies are attached:

- **Toggle Proxies button** in Program Monitor (button with two rectangles)
- Or: **Preferences** → **Media** → **Enable Proxies**
- Keyboard shortcut: Assign via **Edit** → **Keyboard Shortcuts** → search "Toggle Proxies"

For export, ensure **"Use Proxies"** is **unchecked** in Export Settings to use original media.

---

## Common Failure Reasons

| Issue | Cause | Solution |
|-------|-------|----------|
| "Unable to attach proxy" | Filename doesn't match | Use matching naming template |
| Proxy won't attach | Frame rate mismatch | Ensure proxy matches source frame rate |
| Audio out of sync | Duration mismatch | Re-generate proxy; verify source integrity |
| "Unsupported format" | Codec incompatible | Use H.264, ProRes, or DNxHD |
| Proxy shows but original offline | Original media moved | Relink original media first |
| "Proxy is larger than original" | Wrong resolution | Proxies should be smaller than original |

---

## Recommended Forge Settings for Premiere Pro

| Setting | Recommended Value |
|---------|-------------------|
| Proxy Profile | `proxy_h264_premiere` or `proxy_prores_lt` |
| Naming Template | `{source_name}_Proxy` |
| Resolution | 1280x720 or 1920x1080 (quarter/half of original) |
| Frame Rate | Match source |

### Premiere-Preferred Codecs

1. **H.264** (.mp4) - Smallest file size, good for laptop editing
2. **ProRes 422 Proxy** (.mov) - Best quality-to-size ratio
3. **DNxHD LB** (.mxf) - Best for cross-platform workflows

---

## Verification Checklist

Before attaching proxies, verify:

- [ ] Proxy file exists in output directory
- [ ] Proxy filename matches original (per your template)
- [ ] Proxy duration matches original clip
- [ ] Proxy frame rate matches original
- [ ] Proxy opens correctly in QuickTime/VLC

---

## Troubleshooting

### "Attach Proxies" is grayed out

- Ensure you've selected clips in the **Project panel**, not the Timeline
- Clips must be video (not audio-only or still images)

### Proxy plays but shows wrong frames

- Frame rate mismatch between proxy and original
- Re-generate proxy with correct frame rate setting

### Proxies detach after reopening project

- Proxy files may have been moved or deleted
- Premiere stores proxy paths absolutely
- Re-attach proxies from new location

### Performance still slow with proxies

1. Verify proxies are actually enabled (check Toggle Proxies button)
2. Ensure proxies are lower resolution than originals
3. Check proxy codec—H.264 is lighter than ProRes

---

## Premiere Pro Proxy Workflow Tips

### Naming Convention

Use Premiere's expected suffix `_Proxy` for automatic matching:
```
Original: A001_C001.mov
Proxy:    A001_C001_Proxy.mov
```

### Folder Structure

Keep proxies in a parallel folder structure:
```
/Project
  /Media
    /Original
      A001_C001.mov
    /Proxy
      A001_C001_Proxy.mov
```

### Reconnecting After Moving Files

1. **Right-click** clip → **"Proxy"** → **"Reconnect Full Resolution Media..."**
2. Or: **"Proxy"** → **"Attach Proxies..."** to reconnect proxies

---

## Further Reading

- [Adobe Help: Create and attach proxies](https://helpx.adobe.com/premiere-pro/using/ingest-proxy-workflow.html)
- Forge documentation: `docs/PROXY_PROFILES.md`
