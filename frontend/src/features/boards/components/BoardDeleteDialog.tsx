import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";

type BoardDeleteDialogProps = {
  open: boolean;
  pendingCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function BoardDeleteDialog({
  open,
  pendingCount,
  onOpenChange,
  onConfirm,
}: BoardDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Delete selected elements?</DialogTitle>
          <DialogDescription>
            {pendingCount === 1
              ? "1 element will be removed from this board."
              : `${pendingCount} elements will be removed from this board.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-3">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500 active:bg-red-600"
            onClick={onConfirm}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
