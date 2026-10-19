import { z } from "zod";
import { zBookmarkListSchema } from "@karakeep/shared/types/lists";
import { zGetTagResponseSchema } from "@karakeep/shared/types/tags";
import { zFeedSchema } from "@karakeep/shared/types/feeds";
import { zPromptSchema } from "@karakeep/shared/types/prompts";
import { zRuleEngineRuleSchema } from "@karakeep/shared/types/rules";
import type { RuleEngineRule } from "@karakeep/shared/types/rules";
import { zWebhookSchema } from "@karakeep/shared/types/webhooks";
import { zUserSettingsSchema } from "@karakeep/shared/types/users";
import { MAX_NUM_TAGS_PER_PAGE } from "@karakeep/shared/types/tags";
import type { APIClient } from "./transfer";

export const zAccountDataSchema = z.object({
  lists: z.array(zBookmarkListSchema).optional(),
  tags: z.array(zGetTagResponseSchema).optional(),
  feeds: z.array(zFeedSchema).optional(),
  prompts: z.array(zPromptSchema).optional(),
  rules: z.array(zRuleEngineRuleSchema).optional(),
  webhooks: z.array(zWebhookSchema).optional(),
  settings: zUserSettingsSchema.optional(),
});
export type AccountData = z.infer<typeof zAccountDataSchema>;
export interface Exclusions {
  excludeLists?: boolean;
  excludeTags?: boolean;
  excludeFeeds?: boolean;
  excludeAiPrompts?: boolean;
  excludeRules?: boolean;
  excludeWebhooks?: boolean;
  excludeUserSettings?: boolean;
}

export async function loadAccount(
  api: APIClient,
  options: Exclusions,
): Promise<AccountData> {
  const data: AccountData = {};
  if (!options.excludeLists)
    data.lists = (await api.lists.list.query()).lists.filter(
      (l) => l.userRole === "owner",
    );
  if (!options.excludeTags) {
    data.tags = [];
    let cursor: { page: number } | null | undefined;
    do {
      const page = await api.tags.list.query({
        limit: MAX_NUM_TAGS_PER_PAGE,
        cursor,
      });
      data.tags.push(...page.tags);
      cursor = page.nextCursor;
    } while (cursor);
  }
  if (!options.excludeFeeds) data.feeds = (await api.feeds.list.query()).feeds;
  if (!options.excludeAiPrompts) data.prompts = await api.prompts.list.query();
  if (!options.excludeRules) data.rules = (await api.rules.list.query()).rules;
  if (!options.excludeWebhooks)
    data.webhooks = (await api.webhooks.list.query()).webhooks;
  if (!options.excludeUserSettings)
    data.settings = await api.users.settings.query();
  return data;
}

export function validateAccount(data: AccountData) {
  const maps = {
    tags: new Map(data.tags?.map((tag) => [tag.id, tag.id])),
    lists: new Map(data.lists?.map((list) => [list.id, list.id])),
    feeds: new Map(data.feeds?.map((feed) => [feed.id, feed.id])),
  };
  for (const rule of data.rules ?? []) remapRule(rule, maps);
  if (data.settings?.curatedTagIds?.some((id) => !maps.tags.has(id)))
    throw new Error(
      "Curated tag settings require included tags. Include tags or exclude user settings.",
    );
}

export async function restoreAccount(data: AccountData, api: APIClient) {
  validateAccount(data);
  const maps = {
    lists: new Map<string, string>(),
    tags: new Map<string, string>(),
    feeds: new Map<string, string>(),
  };
  const remaining = new Map(data.lists?.map((l) => [l.id, l]));
  const existingLists = (
    await (data.lists ? api.lists.list.query() : Promise.resolve({ lists: [] }))
  ).lists;
  while (remaining.size) {
    let progress = false;
    for (const [id, list] of remaining) {
      if (list.parentId && !maps.lists.has(list.parentId)) continue;
      const parentId = list.parentId ? maps.lists.get(list.parentId) : null;
      const match = existingLists.find(
        (l) =>
          l.userRole === "owner" &&
          l.name === list.name &&
          l.type === list.type &&
          l.icon === list.icon &&
          (l.parentId ?? null) === parentId &&
          (l.query ?? null) === (list.query ?? null) &&
          (l.description ?? null) === (list.description ?? null),
      );
      const target =
        match ??
        (await api.lists.create.mutate({
          name: list.name,
          icon: list.icon,
          type: list.type,
          description: list.description ?? undefined,
          query: list.query ?? undefined,
          parentId,
        }));
      if (!match && list.public)
        await api.lists.edit.mutate({ listId: target.id, public: true });
      // Existing destination metadata/visibility is deliberately preserved.
      maps.lists.set(id, target.id);
      remaining.delete(id);
      progress = true;
    }
    if (!progress) throw new Error("Cannot resolve exported list hierarchy");
  }
  if (data.tags) {
    const existing = (await api.tags.list.query({})).tags;
    for (const tag of data.tags) {
      const match = existing.find((t) => t.name === tag.name);
      // Never treat a permission/network failure as a duplicate.
      const target =
        match ?? (await api.tags.create.mutate({ name: tag.name }));
      maps.tags.set(tag.id, target.id);
    }
  }
  for (const feed of data.feeds ?? []) {
    const created = await api.feeds.create.mutate({
      name: feed.name,
      url: feed.url,
      enabled: feed.enabled,
      importTags: feed.importTags,
    });
    maps.feeds.set(feed.id, created.id);
  }
  for (const prompt of data.prompts ?? []) {
    const created = await api.prompts.create.mutate({
      text: prompt.text,
      appliesTo: prompt.appliesTo,
    });
    if (created.enabled !== prompt.enabled)
      await api.prompts.update.mutate({
        promptId: created.id,
        enabled: prompt.enabled,
      });
  }
  for (const webhook of data.webhooks ?? []) {
    if (webhook.hasToken)
      throw new Error(
        "Cannot restore a webhook with a secret token. Exclude webhooks and recreate it explicitly.",
      );
    await api.webhooks.create.mutate({
      url: webhook.url,
      events: webhook.events,
    });
  }
  for (const rule of data.rules ?? [])
    await api.rules.create.mutate(remapRule(rule, maps));
  if (data.settings) {
    const curatedTagIds =
      data.settings.curatedTagIds?.map((id) => {
        const mapped = maps.tags.get(id);
        if (!mapped)
          throw new Error(
            "Curated tag settings require included tags. Include tags or exclude user settings.",
          );
        return mapped;
      }) ?? null;
    await api.users.updateSettings.mutate({ ...data.settings, curatedTagIds });
  }
  return maps;
}

function remapRule(
  rule: RuleEngineRule,
  maps: {
    tags: Map<string, string>;
    lists: Map<string, string>;
    feeds: Map<string, string>;
  },
) {
  const mapped = (kind: keyof typeof maps, id: string) => {
    const result = maps[kind].get(id);
    if (!result)
      throw new Error(
        `Rule references excluded or missing ${kind} entry ${id}. Exclude that rule or include its dependencies.`,
      );
    return result;
  };
  const condition = (
    value: RuleEngineRule["condition"],
  ): RuleEngineRule["condition"] => {
    switch (value.type) {
      case "hasTag":
        return { ...value, tagId: mapped("tags", value.tagId) };
      case "importedFromFeed":
        return { ...value, feedId: mapped("feeds", value.feedId) };
      case "and":
      case "or":
        return { ...value, conditions: value.conditions.map(condition) };
      default:
        return value;
    }
  };
  const event = rule.event;
  return {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    condition: condition(rule.condition),
    event:
      event.type === "tagAdded" || event.type === "tagRemoved"
        ? { ...event, tagId: mapped("tags", event.tagId) }
        : event.type === "addedToList" || event.type === "removedFromList"
          ? {
              ...event,
              listIds: event.listIds.map((id) => mapped("lists", id)),
            }
          : event,
    actions: rule.actions.map((action) =>
      action.type === "addTag" || action.type === "removeTag"
        ? { ...action, tagId: mapped("tags", action.tagId) }
        : action.type === "addToList" || action.type === "removeFromList"
          ? { ...action, listId: mapped("lists", action.listId) }
          : action,
    ),
  };
}

export async function listMembership(api: APIClient, data: AccountData) {
  const membership: Record<string, string[]> = {};
  for (const list of data.lists ?? []) {
    if (list.type !== "manual") continue;
    let cursor;
    do {
      const page = await api.bookmarks.getBookmarks.query({
        listId: list.id,
        limit: 100,
        cursor,
        useCursorV2: true,
      });
      for (const bookmark of page.bookmarks)
        (membership[bookmark.id] ??= []).push(list.id);
      cursor = page.nextCursor;
    } while (cursor);
  }
  return membership;
}
