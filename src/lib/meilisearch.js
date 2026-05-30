import { Meilisearch } from 'meilisearch';
import { env } from '../env.js';
import { legacyData } from './legacy-data.js';

let client = null;

if (env.meilisearchHost) {
  client = new Meilisearch({
    host: env.meilisearchHost,
    apiKey: env.meilisearchKey,
  });
}

export const meilisearch = client;

export async function initMeilisearch() {
  if (!client) return;

  try {
    // Lwa Index
    const lwaIndex = client.index('lwa');
    await lwaIndex.updateSettings({
      searchableAttributes: ['name', 'family', 'title.fr', 'story.fr', 'domain.fr'],
      filterableAttributes: ['family', 'elements'],
      sortableAttributes: ['name'],
    });

    // Posts Index
    const postsIndex = client.index('posts');
    await postsIndex.updateSettings({
      searchableAttributes: ['title', 'body', 'tags'],
      filterableAttributes: ['type', 'authorId', 'lwaId', 'lang'],
    });

    const lwaDocs = Array.isArray(legacyData?.LWA) ? legacyData.LWA : [];
    if (lwaDocs.length > 0) {
      const stats = await lwaIndex.getStats();
      if ((stats?.numberOfDocuments ?? 0) === 0) {
        await indexLwa(lwaDocs);
      }
    }

    console.log('Meilisearch indexes initialized');
  } catch (err) {
    console.warn('Meilisearch init failed:', err.message);
  }
}

export async function indexLwa(lwaItems) {
  if (!client) return;
  const index = client.index('lwa');
  await index.addDocuments(lwaItems.map(l => ({
    id: l.id || l.slug,
    name: l.name,
    family: l.family,
    title: l.title,
    story: l.story,
    domain: l.domain,
    elements: l.elements,
  })));
}

export async function indexPost(post) {
  if (!client) return;
  const index = client.index('posts');
  await index.addDocuments([{
    id: post.id,
    authorId: post.authorId,
    type: post.type,
    title: post.title,
    body: post.body,
    lwaId: post.lwaId,
    tags: post.tags ? JSON.parse(post.tags) : [],
    lang: post.lang,
    createdAt: post.createdAt,
  }]);
}
