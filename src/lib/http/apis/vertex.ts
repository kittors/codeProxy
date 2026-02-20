import { apiClient } from "@/lib/http/client";

export const vertexApi = {
  importCredential: (file: File, location?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (location) {
      formData.append("location", location);
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
