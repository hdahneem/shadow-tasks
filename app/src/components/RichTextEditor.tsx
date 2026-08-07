import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

export function RichTextEditor({
  value,
  onSave,
  placeholder = 'Add a description…',
}: {
  value: string;
  onSave: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'rich-text-content focus:outline-none min-h-[80px]',
      },
    },
    onBlur: ({ editor }) => {
      onSave(editor.getHTML());
    },
  });

  // keep the editor in sync if the underlying task description changes elsewhere
  // (e.g. after a fresh fetch), without clobbering in-progress edits.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== (value || '<p></p>')) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  return (
    <div>
      <div className="flex gap-1 mb-2">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullet list"
        >
          •≡
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          label="Heading"
        >
          H
        </ToolbarButton>
      </div>
      <div className="hud-input px-3 py-2 text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`w-7 h-7 flex items-center justify-center text-xs border cursor-pointer transition-colors ${
        active
          ? 'border-cyan-bright text-cyan-bright bg-cyan-dim/15'
          : 'border-cyan-dim/30 text-mist hover:text-cyan-bright hover:border-cyan-dim/60'
      }`}
    >
      {children}
    </button>
  );
}
