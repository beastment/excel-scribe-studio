import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText } from '@/components/EditableText';
import { useEditMode } from '@/contexts/EditModeContext';

interface EditableFeatureListProps {
  appId: string;
  features: string[];
  color: string;
}

export const EditableFeatureList: React.FC<EditableFeatureListProps> = ({
  appId,
  features: initialFeatures,
  color
}) => {
  const { isEditMode, getEditedContent, setPendingEdit } = useEditMode();
  
  // Get current features from edited content or use initial
  const getFeaturesFromContent = () => {
    const featuresKey = `app-features-${appId}`;
    const editedFeatures = getEditedContent(featuresKey, '');
    if (editedFeatures) {
      try {
        return JSON.parse(editedFeatures);
      } catch {
        return initialFeatures;
      }
    }
    return initialFeatures;
  };

  const [features, setFeatures] = useState<string[]>(getFeaturesFromContent);

  const updateFeatures = (newFeatures: string[]) => {
    setFeatures(newFeatures);
    const featuresKey = `app-features-${appId}`;
    setPendingEdit(featuresKey, JSON.stringify(newFeatures));
  };

  const addFeature = () => {
    const newFeatures = [...features, 'New feature'];
    updateFeatures(newFeatures);
  };

  const removeFeature = (index: number) => {
    const newFeatures = features.filter((_, idx) => idx !== index);
    updateFeatures(newFeatures);
  };

  const updateFeature = (index: number, newValue: string) => {
    const newFeatures = [...features];
    newFeatures[index] = newValue;
    updateFeatures(newFeatures);
  };

  return (
    <div className="space-y-3 mb-8 relative group">
      {features.map((feature, idx) => (
        <div key={idx} className="flex items-center space-x-3 relative group/item">
          <div className={`w-2 h-2 rounded-full mr-2 bg-gradient-to-r ${color}`}></div>
          <EditableText
            contentKey={`app-feature-${appId}-${idx}`}
            as="span"
            className="text-card-foreground font-medium flex-1"
            onBlur={(newContent) => updateFeature(idx, newContent)}
          >
            {feature}
          </EditableText>
          {isEditMode && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeFeature(idx)}
              className="h-6 w-6 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity text-destructive hover:text-destructive"
              title="Remove feature"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
      
      {isEditMode && (
        <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-2 h-2 rounded-full mr-2 bg-muted"></div>
          <Button
            size="sm"
            variant="outline"
            onClick={addFeature}
            className="h-8 px-3 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Feature
          </Button>
        </div>
      )}
    </div>
  );
};