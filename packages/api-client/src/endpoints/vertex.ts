import { apiClient } from "../client/client";

export interface VertexImportCredentialResponse {
  status: "ok";
  project_id?: string;
  email?: string;
  location?: string;
  auth_file?: string;
  "auth-file"?: string;
}

export const vertexApi = {
  importCredential: (file: File, location?: string, options?: { proxyId?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (location) {
      formData.append("location", location);
    }
    const proxyId = options?.proxyId?.trim();
    if (proxyId) {
      formData.append("proxy_id", proxyId);
    }
    return apiClient.postForm<VertexImportCredentialResponse>("/vertex/import", formData);
  },
};
