import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "../NotFound";

describe("NotFound", () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <NotFound />
      </MemoryRouter>
    );

  it("renders 404 heading", () => {
    renderAt("/xyz");
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows 'Página não encontrada'", () => {
    renderAt("/xyz");
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
  });

  it("displays the invalid path", () => {
    renderAt("/rota-invalida");
    expect(screen.getByText("/rota-invalida")).toBeInTheDocument();
  });

  it("has a link to home", () => {
    renderAt("/xyz");
    expect(screen.getByRole("link", { name: /início/i })).toHaveAttribute("href", "/");
  });
});
