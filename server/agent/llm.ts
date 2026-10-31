import { createModels, type Model, type Models } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { config } from "../config.ts";

export type Llm = { models: Models; model: Model<any> };

export function claude(): Llm {
  const models = createModels();
  models.setProvider(anthropicProvider());
  const model = models.getModel("anthropic", config.aiModel);
  if (!model) throw new Error(`Unknown Claude model: ${config.aiModel}`);
  return { models, model };
}

export async function aiConfigured({ models, model }: Llm): Promise<boolean> {
  return (await models.getAuth(model)) !== undefined;
}
