import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import BookmarkTextMarkdown from "@/components/bookmarks/BookmarkTextMarkdown";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useColorScheme } from "nativewind";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

interface BookmarkTextViewProps {
  bookmark: ZBookmark;
  canEditContent: boolean;
  textVersion?: number;
}

export default function BookmarkTextView({
  bookmark,
  canEditContent,
  textVersion,
}: BookmarkTextViewProps) {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Wrong content type rendered");
  }
  const { toast } = useToast();
  const { colorScheme } = useColorScheme();
  const api = useTRPC();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(false);
  const initialText = bookmark.content.text;
  const [content, setContent] = useState(initialText);
  const [baseVersion, setBaseVersion] = useState(textVersion);

  const setEditing = (editing: boolean) => {
    isEditingRef.current = editing;
    setIsEditing(editing);
  };

  useEffect(() => {
    if (isEditingRef.current) return;
    setContent(initialText);
    setBaseVersion(textVersion);
  }, [initialText, textVersion]);

  const { mutate, isPending } = useUpdateBookmark();

  const handleSave = (draft = content, version = baseVersion) => {
    mutate(
      {
        bookmarkId: bookmark.id,
        text: draft,
        ...(version === undefined ? {} : { textBaseVersion: version }),
      },
      {
        onError: (error, input) => {
          const errorCode = (error as { data?: { code?: string } }).data?.code;
          if (errorCode === "CONFLICT") {
            void Promise.all([
              queryClient.fetchQuery(
                api.bookmarks.getBookmark.queryOptions({
                  bookmarkId: bookmark.id,
                  includeContent: false,
                }),
              ),
              queryClient.fetchQuery(
                api.bookmarks.getContentPermissions.queryOptions({
                  bookmarkId: bookmark.id,
                }),
              ),
            ])
              .then(([serverBookmark, permissions]) => {
                const serverText =
                  serverBookmark.content.type === BookmarkTypes.TEXT
                    ? serverBookmark.content.text
                    : "";
                Alert.alert(
                  "Text changed elsewhere",
                  "Choose which version to keep.",
                  [
                    {
                      text: "Use server version",
                      style: "cancel",
                      onPress: () => {
                        setContent(serverText);
                        setBaseVersion(permissions.textVersion);
                        setEditing(false);
                      },
                    },
                    {
                      text: "Keep my draft",
                      onPress: () =>
                        handleSave(input.text ?? "", permissions.textVersion),
                    },
                  ],
                );
              })
              .catch(() => {
                toast({
                  message: "Something went wrong",
                  variant: "destructive",
                });
              });
            return;
          }
          toast({
            message: "Something went wrong",
            variant: "destructive",
          });
        },
        onSuccess: () => {
          setContent(draft);
          setEditing(false);
          setBaseVersion((current) =>
            version === undefined ? current : version + 1,
          );
          toast({
            message: "Text updated successfully",
            showProgress: false,
          });
        },
      },
    );
  };

  const handleDiscard = () => {
    setContent(initialText);
    setBaseVersion(textVersion);
    setEditing(false);
    Keyboard.dismiss();
  };

  if (isEditing) {
    return (
      <View className="flex-1 p-4">
        <View className="flex-row justify-end gap-2 px-4 py-2">
          <Button
            size="sm"
            onPress={handleDiscard}
            disabled={isPending}
            variant="plain"
          >
            <Text>Cancel</Text>
          </Button>
          <Button size="sm" onPress={() => handleSave()} disabled={isPending}>
            <Text>{isPending ? "Saving..." : "Save"}</Text>
          </Button>
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          editable={!isPending}
          placeholder="Enter your text here..."
          placeholderTextColor={colorScheme === "dark" ? "#666" : "#999"}
          style={{
            flex: 1,
            fontSize: 16,
            lineHeight: 24,
            color: colorScheme === "dark" ? "#fff" : "#000",
            textAlignVertical: "top",
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colorScheme === "dark" ? "#333" : "#ddd",
            backgroundColor: colorScheme === "dark" ? "#111" : "#fff",
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView className="m-4 flex-1 rounded-lg border border-border bg-card p-2">
      <Pressable
        disabled={!canEditContent}
        onPress={() => canEditContent && setEditing(true)}
      >
        <View className="min-h-[200px] rounded-xl p-4">
          <BookmarkTextMarkdown text={content} />
          {content.trim() === "" && canEditContent && (
            <Text className="italic text-muted-foreground">
              Tap to add text...
            </Text>
          )}
        </View>
      </Pressable>
    </ScrollView>
  );
}
