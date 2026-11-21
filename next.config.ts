import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Solo se optimizan las fotos subidas por las barberías (`/media/**`, sin query string).
    localPatterns: [{ pathname: "/media/**", search: "" }],
  },
  experimental: {
    serverActions: {
      // Subida de fotos de la landing por Server Action: el cliente achica a ≤1600px y el
      // servidor rechaza archivos de más de 3MB; el resto es margen para el multipart.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
