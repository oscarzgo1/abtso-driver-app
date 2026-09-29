import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../config/theme.dart';

/// Six segmented PIN cells over one invisible text field — the field keeps
/// the system number pad, paste and secure-entry behaviour; the cells are
/// purely visual. Tapping anywhere on the row focuses the field.
class PinBoxes extends StatefulWidget {
  final TextEditingController controller;
  final int length;
  final bool obscure;
  final bool hasError;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onCompleted;

  const PinBoxes({
    super.key,
    required this.controller,
    this.length = 6,
    this.obscure = true,
    this.hasError = false,
    this.onChanged,
    this.onCompleted,
  });

  @override
  State<PinBoxes> createState() => _PinBoxesState();
}

class _PinBoxesState extends State<PinBoxes> {
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
    _focusNode.addListener(_rebuild);
  }

  @override
  void didUpdateWidget(PinBoxes old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_rebuild);
      widget.controller.addListener(_rebuild);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    _focusNode.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  Widget _cell(int index, String value) {
    final filled = index < value.length;
    final active = _focusNode.hasFocus &&
        index == value.length.clamp(0, widget.length - 1);

    final Color borderColor;
    final double borderWidth;
    if (widget.hasError) {
      borderColor = TachyoTheme.brandRed;
      borderWidth = 1.5;
    } else if (active) {
      borderColor = TachyoTheme.charcoal;
      borderWidth = 2;
    } else {
      borderColor = filled ? const Color(0xFFBDBDBD) : TachyoTheme.border;
      borderWidth = 1.5;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: 42,
      height: 50,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: active ? Colors.white : TachyoTheme.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor, width: borderWidth),
      ),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 140),
        transitionBuilder: (child, animation) =>
            ScaleTransition(scale: animation, child: child),
        child: !filled
            ? const SizedBox.shrink(key: ValueKey('empty'))
            : widget.obscure
                ? Container(
                    key: const ValueKey('dot'),
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                        color: TachyoTheme.charcoal, shape: BoxShape.circle),
                  )
                : Text(
                    value[index],
                    key: ValueKey('d$index${value[index]}'),
                    style: GoogleFonts.outfit(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: TachyoTheme.charcoal),
                  ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final value = widget.controller.text;
    // Compact fixed-size cells, left-aligned under the "PIN" label.
    return Align(
      alignment: Alignment.centerLeft,
      child: Stack(
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < widget.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                _cell(i, value),
              ],
            ],
          ),
          Positioned.fill(
            child: Opacity(
              opacity: 0,
              child: TextField(
                controller: widget.controller,
                focusNode: _focusNode,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                showCursor: false,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(widget.length),
                ],
                decoration: const InputDecoration.collapsed(hintText: null),
                onChanged: (v) {
                  widget.onChanged?.call(v);
                  if (v.length == widget.length) {
                    _focusNode.unfocus();
                    widget.onCompleted?.call();
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
