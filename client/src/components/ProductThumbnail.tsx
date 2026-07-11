import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Image as ImageIcon } from "lucide-react";

interface ProductThumbnailProps {
  imageUrl?: string | null;
  productName: string;
  size?: "sm" | "md" | "lg";
  showPreview?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-16 h-16",
};

const previewSizes = {
  sm: "w-32 h-32",
  md: "w-48 h-48",
  lg: "w-64 h-64",
};

/**
 * Componente de thumbnail com fallback e preview ao hover
 * Exibe imagem do produto ou ícone de fallback
 */
export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  imageUrl,
  productName,
  size = "md",
  showPreview = true,
  className = "",
}) => {
  const [imageError, setImageError] = useState(false);

  const thumbnailClass = `${sizeClasses[size]} rounded object-cover border border-gray-200 bg-gray-50`;
  const previewClass = `${previewSizes[size]} rounded object-cover border border-gray-300 bg-gray-100`;

  const thumbnail = (
    <div className={`relative ${className}`}>
      {imageUrl && !imageError ? (
        <img
          src={imageUrl}
          alt={productName}
          className={thumbnailClass}
          onError={() => setImageError(true)}
          title={productName}
        />
      ) : (
        <div
          className={`${thumbnailClass} flex items-center justify-center bg-gray-100`}
          title="Sem imagem"
        >
          <ImageIcon className="w-4 h-4 text-gray-400" />
        </div>
      )}
    </div>
  );

  if (!showPreview || !imageUrl || imageError) {
    return thumbnail;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer hover:opacity-80 transition-opacity">
          {thumbnail}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side="right" align="start">
        <img
          src={imageUrl}
          alt={`Preview: ${productName}`}
          className={previewClass}
          onError={() => setImageError(true)}
        />
        <p className="text-xs text-gray-600 mt-2 text-center truncate">
          {productName}
        </p>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Componente para exibir múltiplos thumbnails em grid
 */
export const ProductThumbnailGrid: React.FC<{
  products: Array<{
    id: number;
    name: string;
    imageUrl?: string | null;
  }>;
  size?: "sm" | "md" | "lg";
  columns?: number;
}> = ({ products, size = "md", columns = 4 }) => {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {products.map((product) => (
        <div key={product.id} className="flex flex-col items-center gap-1">
          <ProductThumbnail
            imageUrl={product.imageUrl}
            productName={product.name}
            size={size}
            showPreview={true}
          />
          <span className="text-xs text-gray-600 text-center truncate w-full">
            {product.name}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ProductThumbnail;
