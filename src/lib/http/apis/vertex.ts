import { apiClient } from "@/lib/http/client";

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
    return apiClient.postForm<{
      status: "ok";
      project_id?: string;
      email?: string;
      location?: string;
      auth_file?: string;
    }>("/vertex/import", formData);
  },
};
