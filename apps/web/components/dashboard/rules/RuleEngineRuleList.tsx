import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { EditingButton } from "@/components/ui/editing-button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useClientConfig } from "@/lib/clientConfig";
import { Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RuleEngineRule } from "@karakeep/shared/types/rules";
import {
  useDeleteRule,
  useUpdateRule,
} from "@karakeep/shared-react/hooks/rules";

export default function RuleList({
  rules,
  onEditRule,
  onDeleteRule,
}: {
  rules: RuleEngineRule[];
  onEditRule: (rule: RuleEngineRule) => void;
  onDeleteRule?: (ruleId: string) => void;
}) {
  const { t } = useTranslation();
  const { demoMode } = useClientConfig();
  const { mutate: updateRule, isPending: isUpdating } = useUpdateRule({
    onSuccess: () => {
      toast({
        description: t("settings.rules.rule_has_been_updated"),
      });
    },
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const { mutate: deleteRule, isPending: isDeleting } = useDeleteRule({
    onSuccess: (_ret, req) => {
      toast({
        description: t("settings.rules.rule_has_been_deleted"),
      });
      onDeleteRule?.(req.id);
    },
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });

  return (
    <RuleListContent
      rules={rules}
      renderActions={(rule) => (
        <div className="flex items-center space-x-2">
          <Switch
            disabled={!!demoMode || isUpdating}
            checked={rule.enabled}
            onCheckedChange={(checked) =>
              updateRule({
                ...rule,
                enabled: checked,
              })
            }
          />
          <EditingButton
            tooltip={t("actions.edit")}
            ignoreDemoMode
            variant="ghost"
            onClick={() => onEditRule(rule)}
          >
            <Edit className="h-4 w-4" />
          </EditingButton>
          <ActionConfirmingDialog
            title={t("settings.rules.delete_rule")}
            description={t("settings.rules.delete_rule_confirmation")}
            actionButton={(setDialogOpen) => (
              <ActionButton
                loading={isDeleting}
                variant="destructive"
                onClick={() => {
                  deleteRule({ id: rule.id });
                  setDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("actions.delete")}
              </ActionButton>
            )}
          >
            <EditingButton
              tooltip={t("actions.delete")}
              variant="ghostDestructive"
            >
              <Trash2 className="h-4 w-4" />
            </EditingButton>
          </ActionConfirmingDialog>
        </div>
      )}
    />
  );
}

export function RuleListContent({
  rules,
  renderActions,
}: {
  rules: RuleEngineRule[];
  renderActions: (rule: RuleEngineRule) => React.ReactNode;
}) {
  const { t } = useTranslation();
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-medium">
          {t("settings.rules.no_rules_created_yet")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("settings.rules.create_your_first_rule")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <Card key={rule.id} className={rule.enabled ? "" : "opacity-70"}>
          <CardContent className="p-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1 sm:mr-4">
                <h3 className="font-medium">{rule.name}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {rule.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center text-xs text-muted-foreground">
                  <span className="flex items-center">
                    <span className="mr-1">Trigger:</span>
                    <span className="font-medium">
                      {formatEventType(rule.event.type)}
                    </span>
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    {rule.actions.length} action
                    {rule.actions.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              {renderActions(rule)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatEventType(type: string): string {
  switch (type) {
    case "bookmarkAdded":
      return "Bookmark Added";
    case "tagAdded":
      return "Tag Added";
    case "tagRemoved":
      return "Tag Removed";
    case "addedToList":
      return "Added to List";
    case "removedFromList":
      return "Removed from List";
    case "favourited":
      return "Favourited";
    case "archived":
      return "Archived";
    default:
      return type;
  }
}
