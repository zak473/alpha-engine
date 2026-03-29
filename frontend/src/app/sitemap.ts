import { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.neverindoubt.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/predictions`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/tipsters`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/challenges`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/performance`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE_URL}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/register`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];
}
