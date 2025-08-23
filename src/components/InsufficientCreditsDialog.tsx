import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Coins } from 'lucide-react';

interface InsufficientCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditsNeeded: number;
  creditsAvailable: number;
}

export const InsufficientCreditsDialog: React.FC<InsufficientCreditsDialogProps> = ({
  open,
  onOpenChange,
  creditsNeeded,
  creditsAvailable,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Insufficient Credits</DialogTitle>
          </div>
          <DialogDescription>
            You don't have enough credits to scan these comments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Credits needed:</span>
              <Badge variant="secondary">{creditsNeeded}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Credits available:</span>
              <Badge variant={creditsAvailable > 0 ? "default" : "destructive"}>
                {creditsAvailable}
              </Badge>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Credits needed:</span>
              <Badge variant="destructive">{creditsNeeded - creditsAvailable}</Badge>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>How credits work:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Each comment row scanned costs 1 credit</li>
              <li>Credits are deducted when you start a scan</li>
              <li>New users receive 20 free credits</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // TODO: Implement buy credits functionality
              onOpenChange(false);
            }}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Coins className="h-4 w-4 mr-2" />
            Buy Credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};