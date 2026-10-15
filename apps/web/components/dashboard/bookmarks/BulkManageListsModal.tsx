import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "@/components/ui/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAddBookmarkToList } from "@karakeep/shared-react/hooks/lists";
import { limitConcurrency } from "@karakeep/shared/concurrency";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";

export default function BulkManageListsModal({
  bookmarkIds,
  open,
  setOpen,
}: {
  bookmarkIds: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const formSchema = z.object({
    listId: z.string({
      error: (issue) =>
        issue.input === undefined ? "Please select a list" : undefined,
    }),
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      listId: undefined,
    },
  });

  const { mutateAsync: addToList, isPending: isAddingToListPending } =
    useAddBookmarkToList({
      onSettled: () => {
        form.resetField("listId");
      },
      onError: (e) => {
        if (e.data?.code == "BAD_REQUEST") {
          toast({
            variant: "destructive",
            description: e.message,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Something went wrong",
          });
        }
      },
    });

  const onSubmit = async (value: z.infer<typeof formSchema>) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (bookmarkId) => () =>
            addToList({
              bookmarkId,
              listId: value.listId,
            }),
        ),
        50,
      ),
    );

    const successes = results.filter((r) => r.status == "fulfilled").length;
    if (successes > 0) {
      toast({
        description: `${successes} bookmarks have been added to the list!`,
      });
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        position="bottom"
        className="left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x-0 border-b-0 bg-card p-0 shadow-2xl sm:bottom-auto sm:left-[50%] sm:top-[calc(var(--vvo)+var(--vvh)/2)] sm:max-h-[calc(var(--vvh)-2rem)] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-6 text-left sm:px-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Add to a list
              </DialogTitle>
              <DialogDescription>
                Add {bookmarkIds.length} selected bookmarks to one manual list.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
              <FormField
                control={form.control}
                name="listId"
                render={({ field }) => {
                  return (
                    <FormItem className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                      <FormLabel>Destination list</FormLabel>
                      <FormControl>
                        <BookmarkListSelector
                          value={field.value}
                          onChange={field.onChange}
                          listTypes={["manual"]}
                          className="h-10 sm:h-11"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <DialogFooter
              equalColumns={2}
              className="sticky bottom-0 border-t border-border/70 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6 sm:py-4"
            >
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Close
                </Button>
              </DialogClose>
              <ActionButton
                type="submit"
                loading={isAddingToListPending}
                disabled={isAddingToListPending}
              >
                Add
              </ActionButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
