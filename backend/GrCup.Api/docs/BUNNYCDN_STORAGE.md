# BunnyCDN Storage Zone

Storage zone for managing static assets and files.

## Connection Settings

| Setting | Value |
|---------|-------|
| Hostname | `storage.bunnycdn.com` |
| Port | `21` |
| Connection Type | Passive |
| Username | See `.env` (`BUNNYCDN_USERNAME`) |
| Password | See `.env` (`BUNNYCDN_PASSWORD`) |
| Read-only Password | See `.env` (`BUNNYCDN_READONLY_PASSWORD`) |

## Quick Connect with FileZilla

1. Open FileZilla
2. Go to **Site Manager** → **New Site**
3. Configure:
   - **Host:** `storage.bunnycdn.com`
   - **Port:** `21`
   - **Protocol:** FTP - File Transfer Protocol
   - **Encryption:** Use plain FTP
   - **Logon Type:** Normal
   - **User:** `jaimedigitalstudio`
   - **Password:** (from `.env` file)
4. Click **Connect**

## API Documentation

For programmatic access, see the official [BunnyCDN Storage API documentation](https://docs.bunny.net/reference/storage-api).

## Environment Variables

Required variables in `.env`:

```bash
BUNNYCDN_HOSTNAME=storage.bunnycdn.com
BUNNYCDN_USERNAME=jaimedigitalstudio
BUNNYCDN_PASSWORD=your-password
BUNNYCDN_READONLY_PASSWORD=your-readonly-password
```
