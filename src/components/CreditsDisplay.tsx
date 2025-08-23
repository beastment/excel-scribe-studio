import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';

interface CreditsDisplayProps {
  credits: number;
  loading?: boolean;
}

export const CreditsDisplay: React.FC<CreditsDisplayProps> = ({ credits, loading }) => {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
        <Coins className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {loading ? (
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          ) : (
            <Badge variant={credits > 10 ? "default" : credits > 0 ? "secondary" : "destructive"} className="text-lg px-3 py-1">
              {credits}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs text-muted-foreground mt-1">
          Credits are used to scan comments
        </CardDescription>
      </CardContent>
    </Card>
  );
};