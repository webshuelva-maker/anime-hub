import { NewsItem } from "@/types/news";

let current: NewsItem[] = [];

export function getNewsItems(): NewsItem[] {
  return current;
}

export function setNewsItems(items: NewsItem[]): void {
  current = items;
}
