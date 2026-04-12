/**
 * Raffle Products Image Upload Test
 * 
 * Test for image upload functionality.
 * Run with: npm run test:endpoints -- tests/endpoints/raffle-products-image-upload.test.ts
 */

import { createApiClient } from './api-client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const fixturesDir = path.join(__dirname, '..', 'fixtures');
const testImagePath = path.join(fixturesDir, 'test-image.png');

describe('Raffle Products Image Upload', () => {
  let api: Awaited<ReturnType<typeof createApiClient>>;
  let createdProductIds: number[] = [];

  beforeAll(async () => {
    api = await createApiClient();
  });

  afterAll(async () => {
    // Cleanup: delete all created products
    for (const id of createdProductIds) {
      try {
        await api.delete(`/api/admin/raffle-products/${id}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should upload image when creating a product', async () => {
    // Copy test image to temp file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `test-image-${Date.now()}.png`);
    fs.copyFileSync(testImagePath, tempFile);

    try {
      const formData = new FormData();
      formData.append('title', 'Product With Image');
      formData.append('subtitle', 'Has an uploaded image');
      
      const fileBuffer = fs.readFileSync(tempFile);
      const file = new File([fileBuffer], 'test-image.png', { type: 'image/png' });
      formData.append('image', file);

      const response = await api.postForm('/api/admin/raffle-products', formData);
      
      console.log('Create with image - Status:', response.status);
      const json = await response.json();
      console.log('Create with image - Response:', JSON.stringify(json, null, 2));
      
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.imageUrl).toBeTruthy();
      
      if (json.data.id) {
        createdProductIds.push(json.data.id);
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  it('should upload image when updating a product', async () => {
    // First create a product without image
    const createForm = new FormData();
    createForm.append('title', 'Product To Update With Image');
    
    const createResponse = await api.postForm('/api/admin/raffle-products', createForm);
    const createJson = await createResponse.json();
    
    expect(createJson.data.id).toBeTruthy();
    const productId = createJson.data.id;
    createdProductIds.push(productId);

    // Copy test image to temp file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `test-image-update-${Date.now()}.png`);
    fs.copyFileSync(testImagePath, tempFile);

    try {
      const updateForm = new FormData();
      updateForm.append('title', 'Updated With Image');
      
      const fileBuffer = fs.readFileSync(tempFile);
      const file = new File([fileBuffer], 'updated-image.png', { type: 'image/png' });
      updateForm.append('image', file);

      const response = await api.putForm(`/api/admin/raffle-products/${productId}`, updateForm);
      
      console.log('Update with image - Status:', response.status);
      const json = await response.json();
      console.log('Update with image - Response:', JSON.stringify(json, null, 2));
      
      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.imageUrl).toBeTruthy();
    } finally {
      fs.unlinkSync(tempFile);
    }
  });
});
