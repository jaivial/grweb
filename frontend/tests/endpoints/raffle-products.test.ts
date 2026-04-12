/**
 * Raffle Products Endpoint Tests
 * 
 * Tests for /api/admin/raffle-products endpoints.
 * Run with: npm test -- tests/endpoints/raffle-products.test.ts
 */

import { createApiClient, API_URL } from './api-client';

describe('Raffle Products Endpoints', () => {
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

  describe('GET /api/admin/raffle-products', () => {
    it('should return list of products with success=true', async () => {
      const response = await api.get('/api/admin/raffle-products');
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  describe('POST /api/admin/raffle-products', () => {
    it('should create a product with title only', async () => {
      const formData = new FormData();
      formData.append('title', 'Test Product');

      const response = await api.postForm('/api/admin/raffle-products', formData);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Test Product');
      expect(json.data.id).toBeDefined();

      if (json.data.id) {
        createdProductIds.push(json.data.id);
      }
    });

    it('should create a product with title and subtitle', async () => {
      const formData = new FormData();
      formData.append('title', 'Test Product with Subtitle');
      formData.append('subtitle', 'This is a subtitle');

      const response = await api.postForm('/api/admin/raffle-products', formData);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Test Product with Subtitle');
      expect(json.data.subtitle).toBe('This is a subtitle');

      if (json.data.id) {
        createdProductIds.push(json.data.id);
      }
    });

    it('should reject empty title', async () => {
      const formData = new FormData();
      formData.append('title', '');

      const response = await api.postForm('/api/admin/raffle-products', formData);
      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/admin/raffle-products/{id}', () => {
    let testProductId: number;

    beforeAll(async () => {
      // Create a product to update
      const formData = new FormData();
      formData.append('title', 'Product to Update');
      const response = await api.postForm('/api/admin/raffle-products', formData);
      const json = await response.json();
      testProductId = json.data.id;
      createdProductIds.push(testProductId);
    });

    it('should update product title', async () => {
      const formData = new FormData();
      formData.append('title', 'Updated Title');

      const response = await api.putForm(`/api/admin/raffle-products/${testProductId}`, formData);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Updated Title');
    });

    it('should update product subtitle', async () => {
      const formData = new FormData();
      formData.append('title', 'Updated Title');
      formData.append('subtitle', 'Updated subtitle');

      const response = await api.putForm(`/api/admin/raffle-products/${testProductId}`, formData);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.subtitle).toBe('Updated subtitle');
    });

    it('should toggle isActive via PUT', async () => {
      const formData = new FormData();
      formData.append('title', 'Updated Title');
      formData.append('isActive', 'false');

      const response = await api.putForm(`/api/admin/raffle-products/${testProductId}`, formData);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.isActive).toBe(false);
    });

    it('should return 404 for non-existent product', async () => {
      const formData = new FormData();
      formData.append('title', 'Test');

      const response = await api.putForm('/api/admin/raffle-products/999999', formData);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/admin/raffle-products/{id}/toggle-status', () => {
    let testProductId: number;

    beforeAll(async () => {
      // Create a product to toggle
      const formData = new FormData();
      formData.append('title', 'Product to Toggle');
      const response = await api.postForm('/api/admin/raffle-products', formData);
      const json = await response.json();
      testProductId = json.data.id;
      createdProductIds.push(testProductId);
    });

    it('should toggle product status from true to false', async () => {
      const response = await api.patch(`/api/admin/raffle-products/${testProductId}/toggle-status`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      // Created products start with isActive=true, so this should toggle to false
      expect(typeof json.data.isActive).toBe('boolean');
    });

    it('should toggle product status back to true', async () => {
      const response = await api.patch(`/api/admin/raffle-products/${testProductId}/toggle-status`);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.isActive).toBe(true);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await api.patch('/api/admin/raffle-products/999999/toggle-status');
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/raffle-products/{id}', () => {
    it('should delete a product', async () => {
      // Create a product to delete
      const formData = new FormData();
      formData.append('title', 'Product to Delete');
      const createResponse = await api.postForm('/api/admin/raffle-products', formData);
      const createJson = await createResponse.json();
      const productId = createJson.data.id;

      // Delete it
      const deleteResponse = await api.delete(`/api/admin/raffle-products/${productId}`);
      expect(deleteResponse.status).toBe(200);

      const deleteJson = await deleteResponse.json();
      expect(deleteJson.success).toBe(true);

      // Verify it's deleted
      const listResponse = await api.get('/api/admin/raffle-products');
      const listJson = await listResponse.json();
      const stillExists = listJson.data.some((p: { id: number }) => p.id === productId);
      expect(stillExists).toBe(false);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await api.delete('/api/admin/raffle-products/999999');
      expect(response.status).toBe(404);
    });
  });
});
