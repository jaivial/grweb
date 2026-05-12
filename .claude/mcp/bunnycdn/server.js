#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.BUNNY_API_KEY;
const STORAGE_KEY = process.env.BUNNY_STORAGE_KEY;
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'jaimedigitalstudio';
const PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL || 'https://jaimedigitalstudio.b-cdn.net';
const API_BASE = 'https://api.bunny.net';
const STORAGE_BASE = `https://storage.bunnycdn.com/${STORAGE_ZONE}`;

// ── Helpers ────────────────────────────────────────────────────────────────

async function bunnyStorageFetch(path, options = {}) {
  const url = `${STORAGE_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      AccessKey: STORAGE_KEY || API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BunnyCDN Storage ${res.status}: ${text}`);
  }
  return res;
}

async function bunnyApiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      AccessKey: API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BunnyCDN API ${res.status}: ${text}`);
  }
  return res;
}

function cdnUrl(path) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${PULL_ZONE_URL}${clean}`;
}

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'bunny_list_files',
    description: 'List files and folders in a BunnyCDN storage zone path. Returns file names, sizes, and whether they are directories.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Storage path to list (e.g. "/grcup/frames/hero"). Use "/" for root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'bunny_upload_file',
    description: 'Upload a file to BunnyCDN storage from a local path. Returns the CDN URL.',
    inputSchema: {
      type: 'object',
      properties: {
        localPath: {
          type: 'string',
          description: 'Absolute path to the local file to upload.',
        },
        remotePath: {
          type: 'string',
          description: 'Destination path in storage (e.g. "/grcup/images/photo.webp").',
        },
      },
      required: ['localPath', 'remotePath'],
    },
  },
  {
    name: 'bunny_upload_buffer',
    description: 'Upload raw bytes (base64) to BunnyCDN storage. Use for generated/processed images.',
    inputSchema: {
      type: 'object',
      properties: {
        base64Data: {
          type: 'string',
          description: 'Base64-encoded file content.',
        },
        remotePath: {
          type: 'string',
          description: 'Destination path in storage (e.g. "/grcup/images/photo.webp").',
        },
        contentType: {
          type: 'string',
          description: 'MIME type (e.g. "image/webp", "image/jpeg"). Default: "application/octet-stream".',
        },
      },
      required: ['base64Data', 'remotePath'],
    },
  },
  {
    name: 'bunny_delete_file',
    description: 'Delete a file from BunnyCDN storage.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Storage path to delete (e.g. "/grcup/images/old-photo.webp").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'bunny_download_file',
    description: 'Download a file from BunnyCDN storage. Returns base64-encoded content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Storage path to download (e.g. "/grcup/images/photo.webp").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'bunny_get_url',
    description: 'Get the public CDN URL for a storage path. No API call needed — just constructs the URL.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Storage path (e.g. "/grcup/frames/hero/001.webp").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'bunny_list_pullzones',
    description: 'List all pull zones in the BunnyCDN account.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bunny_purge_cache',
    description: 'Purge the cache for a pull zone by ID. Useful after uploading updated files.',
    inputSchema: {
      type: 'object',
      properties: {
        pullZoneId: {
          type: 'number',
          description: 'Pull zone ID to purge.',
        },
      },
      required: ['pullZoneId'],
    },
  },
  {
    name: 'bunny_storage_usage',
    description: 'Get storage zone usage info (files count, size).',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Storage path to check. Use "/" for root.',
        },
      },
      required: ['path'],
    },
  },
];

// ── Tool handlers ──────────────────────────────────────────────────────────

async function handleListFiles(args) {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const res = await bunnyStorageFetch(path);
  const data = await res.json();

  const items = (Array.isArray(data) ? data : []).map(item => ({
    name: item.ObjectName || item.name,
    isDirectory: item.IsDirectory ?? item.isDirectory ?? false,
    size: item.Length ?? item.size ?? 0,
    lastChanged: item.LastChanged || item.lastChanged,
    cdnUrl: !item.IsDirectory ? cdnUrl(`${path}/${item.ObjectName || item.name}`) : undefined,
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ path, count: items.length, items }, null, 2),
    }],
  };
}

async function handleUploadFile(args) {
  const { localPath, remotePath } = args;
  const normalizedPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;

  const fs = await import('fs');
  const fileBuffer = fs.readFileSync(localPath);

  const res = await bunnyStorageFetch(normalizedPath, {
    method: 'PUT',
    body: fileBuffer,
    headers: { 'Content-Type': 'application/octet-stream' },
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        storagePath: normalizedPath,
        cdnUrl: cdnUrl(normalizedPath),
        sizeBytes: fileBuffer.length,
      }, null, 2),
    }],
  };
}

async function handleUploadBuffer(args) {
  const { base64Data, remotePath, contentType } = args;
  const normalizedPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
  const buffer = Buffer.from(base64Data, 'base64');

  await bunnyStorageFetch(normalizedPath, {
    method: 'PUT',
    body: buffer,
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        storagePath: normalizedPath,
        cdnUrl: cdnUrl(normalizedPath),
        sizeBytes: buffer.length,
      }, null, 2),
    }],
  };
}

async function handleDeleteFile(args) {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  await bunnyStorageFetch(path, { method: 'DELETE' });

  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: path }, null, 2) }],
  };
}

async function handleDownloadFile(args) {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const res = await bunnyStorageFetch(path);
  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        path,
        base64Data: buffer.toString('base64'),
        sizeBytes: buffer.length,
      }, null, 2),
    }],
  };
}

function handleGetUrl(args) {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ path, cdnUrl: cdnUrl(path) }, null, 2),
    }],
  };
}

async function handleListPullzones() {
  const res = await bunnyApiFetch('/pullzone');
  const data = await res.json();

  const zones = (Array.isArray(data) ? data : data.Items || []).map(z => ({
    id: z.Id,
    name: z.Name,
    originUrl: z.OriginUrl,
    customDomains: z.CustomDomains || [],
    monthlyBandwidthUsed: z.MonthlyBandwidthUsed,
  }));

  return {
    content: [{ type: 'text', text: JSON.stringify({ count: zones.length, pullZones: zones }, null, 2) }],
  };
}

async function handlePurgeCache(args) {
  await bunnyApiFetch(`/pullzone/${args.pullZoneId}/purgeCache`, { method: 'POST' });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ success: true, purgedPullZoneId: args.pullZoneId }, null, 2),
    }],
  };
}

async function handleStorageUsage(args) {
  const path = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const res = await bunnyStorageFetch(path);
  const data = await res.json();

  const items = Array.isArray(data) ? data : [];
  const files = items.filter(i => !(i.IsDirectory ?? i.isDirectory));
  const dirs = items.filter(i => (i.IsDirectory ?? i.isDirectory));
  const totalSize = files.reduce((sum, f) => sum + (f.Length ?? f.size ?? 0), 0);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        path,
        filesCount: files.length,
        directoriesCount: dirs.length,
        totalSizeBytes: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      }, null, 2),
    }],
  };
}

// ── Tool router ────────────────────────────────────────────────────────────

const HANDLERS = {
  bunny_list_files: handleListFiles,
  bunny_upload_file: handleUploadFile,
  bunny_upload_buffer: handleUploadBuffer,
  bunny_delete_file: handleDeleteFile,
  bunny_download_file: handleDownloadFile,
  bunny_get_url: handleGetUrl,
  bunny_list_pullzones: handleListPullzones,
  bunny_purge_cache: handlePurgeCache,
  bunny_storage_usage: handleStorageUsage,
};

// ── Server setup ───────────────────────────────────────────────────────────

const server = new Server(
  { name: 'bunnycdn', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];

  if (!handler) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  try {
    return await handler(args || {});
  } catch (err) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
      isError: true,
    };
  }
});

// ── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
