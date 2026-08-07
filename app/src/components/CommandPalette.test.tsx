import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { ModalActionsContext } from '../context/ModalActionsContext';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';

function renderPalette({ open = true, onClose = vi.fn(), onShowHelp = vi.fn() } = {}) {
  const openCreateFolder = vi.fn();
  const openCreateProject = vi.fn();
  const openSettings = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <ModalActionsContext.Provider value={{ openCreateFolder, openCreateProject, openSettings }}>
        <CommandPalette open={open} onClose={onClose} onShowHelp={onShowHelp} />
        <Routes>
          <Route path="/" element={<div>Status Window Page</div>} />
          <Route path="/calendar" element={<div>Calendar Page</div>} />
          <Route path="/projects/:id" element={<div>Project Page</div>} />
          <Route path="/workload" element={<div>Workload Page</div>} />
          <Route path="/badges" element={<div>Badges Page</div>} />
        </Routes>
      </ModalActionsContext.Provider>
    </MemoryRouter>
  );
  return { ...utils, onClose, onShowHelp, openCreateFolder, openCreateProject, openSettings };
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useStore.setState({
      folders: [{ id: 'f1', workspaceId: 'w1', name: 'Dungeon Raids', color: '#22d3ee', createdAt: '' }],
      projects: [
        { id: 'p1', workspaceId: 'w1', folderId: 'f1', name: 'Clear the Red Gate', rank: 'D', createdAt: '', effectiveRole: 'admin' },
      ],
    });
    useThemeStore.setState({ preference: 'system' });
  });

  it('renders nothing when closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByPlaceholderText('Type a command or search…')).not.toBeInTheDocument();
  });

  it('lists page, project, and folder commands grouped, filterable by query', () => {
    renderPalette();
    expect(screen.getByText('Go to Calendar')).toBeInTheDocument();
    expect(screen.getByText('Clear the Red Gate')).toBeInTheDocument();
    expect(screen.getByText('Dungeon Raids')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'calendar' } });
    expect(screen.getByText('Go to Calendar')).toBeInTheDocument();
    expect(screen.queryByText('Clear the Red Gate')).not.toBeInTheDocument();
  });

  it('navigates and closes when a page command is clicked', () => {
    const { onClose } = renderPalette();
    fireEvent.click(screen.getByText('Go to Calendar'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Calendar Page')).toBeInTheDocument();
  });

  it('lists and navigates to the newest pages (Workload, Badges)', () => {
    const { onClose } = renderPalette();
    expect(screen.getByText('Go to Workload')).toBeInTheDocument();
    expect(screen.getByText('Go to Badges')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Go to Workload'));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Workload Page')).toBeInTheDocument();
  });

  it('navigates to a project via keyboard: filter, ArrowDown, Enter', () => {
    const { onClose } = renderPalette();
    const input = screen.getByPlaceholderText('Type a command or search…');
    fireEvent.change(input, { target: { value: 'red gate' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText('Project Page')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { onClose } = renderPalette();
    fireEvent.keyDown(screen.getByPlaceholderText('Type a command or search…'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers the New Folder action and closes', () => {
    const { onClose, openCreateFolder } = renderPalette();
    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'new folder' } });
    fireEvent.click(screen.getByText('New Folder'));
    expect(openCreateFolder).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('cycles the theme preference from the palette', () => {
    const { onClose } = renderPalette();
    fireEvent.click(screen.getByText('Switch Theme (currently system)'));
    expect(useThemeStore.getState().preference).toBe('light');
    expect(onClose).toHaveBeenCalled();
  });

  it('opens the shortcuts help from the palette', () => {
    const { onClose, onShowHelp } = renderPalette();
    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'shortcut' } });
    fireEvent.click(screen.getByText('Keyboard Shortcuts'));
    expect(onShowHelp).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('opens Hunter Settings from the palette', () => {
    const { onClose, openSettings } = renderPalette();
    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'settings' } });
    fireEvent.click(screen.getByText('Hunter Settings'));
    expect(openSettings).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('signs out via the palette', () => {
    const logoutSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ logout: logoutSpy });
    renderPalette();
    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'sign out' } });
    fireEvent.click(screen.getByText('Sign Out'));
    expect(logoutSpy).toHaveBeenCalled();
  });

  it('shows a message when no commands match', () => {
    renderPalette();
    fireEvent.change(screen.getByPlaceholderText('Type a command or search…'), { target: { value: 'zzz-nope' } });
    expect(screen.getByText('No matching commands.')).toBeInTheDocument();
  });
});
