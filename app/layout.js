export const metadata = {
  title: "SuperThings Hub",
  description: "Centro de información en tiempo real sobre SuperThings",
};

export const viewport = {
  themeColor: "#0a0118",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
